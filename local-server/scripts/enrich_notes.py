#!/usr/bin/env python3
"""
Batch AI note enrichment script.
Fills `abstract` and `connect` fields in YAML frontmatter for every .md file
in an Obsidian vault, using Claude Code CLI, Codex CLI, or Cursor agent CLI.

Usage:
  python enrich_notes.py --vault /mnt/d/obsidian/personal_willy
  python enrich_notes.py --vault /mnt/d/obsidian/personal_willy --dry-run
  python enrich_notes.py --vault /mnt/d/obsidian/personal_willy --force
  python enrich_notes.py --vault /mnt/d/obsidian/personal_willy --limit 3
  python enrich_notes.py --file /path/to/note.md --dry-run
  python enrich_notes.py --vault /path/to/vault --file /path/to/note.md --dry-run
  python enrich_notes.py --backend codex --file /path/to/note.md   # force Codex CLI
  python enrich_notes.py --backend cursor --file /path/to/note.md  # force Cursor agent CLI
  python enrich_notes.py --backend claude --file /path/to/note.md  # force Claude Code CLI
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import json
import time
from pathlib import Path


FM_RE = re.compile(r'^---\s*\n([\s\S]*?)\n---\s*\n?', re.MULTILINE)


def parse_frontmatter(content: str) -> tuple[str | None, str]:
    """Return (raw_fm_text, body) or (None, full_content) if no frontmatter."""
    m = FM_RE.match(content)
    if not m:
        return None, content
    return m.group(1), content[m.end():]


def fm_field_is_empty(fm_text: str, field: str) -> bool:
    """Return True if the field is absent OR exists with no value (e.g. 'abstract:')."""
    key_present = re.search(rf'^{re.escape(field)}:', fm_text, re.MULTILINE)
    if not key_present:
        return True
    blank_value = re.compile(rf'^{re.escape(field)}:\s*$', re.MULTILINE)
    return bool(blank_value.search(fm_text))


def set_fm_field_scalar(fm_text: str, field: str, value: str) -> str:
    """Replace 'field:' or 'field: old' with 'field: value'."""
    pattern = re.compile(rf'^({re.escape(field)}):.*$', re.MULTILINE)
    replacement = f'{field}: {value}'
    if pattern.search(fm_text):
        return pattern.sub(replacement, fm_text, count=1)
    return fm_text + f'\n{replacement}'


def set_fm_field_list(fm_text: str, field: str, items: list[str]) -> str:
    """Replace 'field:' block with a YAML list block."""
    block_pattern = re.compile(
        rf'^{re.escape(field)}:.*?(?=\n\S|\Z)', re.MULTILINE | re.DOTALL
    )
    yaml_list = f'{field}:\n' + '\n'.join(f'  - {item}' for item in items)
    if block_pattern.search(fm_text):
        return block_pattern.sub(yaml_list, fm_text, count=1)
    return fm_text + f'\n{yaml_list}'


ENRICH_PROMPT_TEMPLATE = (
    "以下是一則 Obsidian 筆記，標題為「{title}」：\n\n"
    "{body}\n\n"
    "請做兩件事：\n"
    "1. 用繁體中文寫一段 1-2 句的摘要（abstract），簡明扼要說明這篇筆記的核心概念。\n"
    "2. 列出 5 個最有可能與其他筆記產生連結的關鍵字詞（connect），用繁體中文，每個 2-6 字。\n\n"
    "只輸出 JSON，格式如下（不要加任何說明）：\n"
    '{{"abstract": "摘要文字", "connect": ["詞1", "詞2", "詞3", "詞4", "詞5"]}}'
)


def _parse_enrich_response(raw: str) -> tuple[str, list[str]]:
    m = re.search(r'\{[\s\S]*\}', raw)
    if not m:
        raise RuntimeError(f"No JSON in response: {raw[:200]}")
    data = json.loads(m.group())
    abstract = str(data.get('abstract', '')).strip()
    connect = [str(c).strip() for c in data.get('connect', [])][:5]
    return abstract, connect


# ── Helpers ───────────────────────────────────────────────────────────

def _is_wsl() -> bool:
    """Detect if running inside Windows Subsystem for Linux."""
    try:
        with open('/proc/version', 'r') as f:
            return 'microsoft' in f.read().lower()
    except FileNotFoundError:
        return False


def _wsl_to_winpath(wsl_path: str) -> str:
    """Convert a /mnt/… WSL path to a Windows-native path via wslpath."""
    return subprocess.run(
        ['wslpath', '-w', wsl_path],
        capture_output=True, text=True, check=True,
    ).stdout.strip()


# ── Locate CLI executables ───────────────────────────────────────────

def get_claude_path() -> str | None:
    env_path = os.environ.get('CLAUDE_BIN')
    if env_path:
        return env_path
    path = shutil.which('claude')
    if path:
        return path
    fallback = '/home/willylin/.npm-global/bin/claude'
    if os.path.exists(fallback):
        return fallback
    return None


def get_cursor_agent_path() -> str | None:
    env_path = os.environ.get('CURSOR_AGENT_BIN')
    if env_path:
        return env_path
    path = shutil.which('agent')
    if path:
        return path
    if sys.platform == 'win32':
        fallback = os.path.expandvars(r'%LOCALAPPDATA%\cursor-agent\agent.ps1')
        if os.path.exists(fallback):
            return fallback
    elif _is_wsl():
        win_user = os.environ.get('WINDOWS_USER')
        if not win_user:
            # try to infer from common WSL mount
            import glob
            candidates = glob.glob('/mnt/c/Users/*/AppData/Local/cursor-agent/cursor-agent.ps1')
            if candidates:
                return candidates[0]
        else:
            fallback = f'/mnt/c/Users/{win_user}/AppData/Local/cursor-agent/cursor-agent.ps1'
            if os.path.exists(fallback):
                return fallback
    return None


def get_codex_path() -> str | None:
    env_path = os.environ.get('CODEX_BIN')
    if env_path:
        return env_path
    path = shutil.which('codex')
    if path:
        return path
    fallbacks = [
        os.path.expanduser('~/.nvm/versions/node/v22.22.2/bin/codex'),
        os.path.expanduser('~/.npm-global/bin/codex'),
        '/usr/local/bin/codex',
    ]
    for fallback in fallbacks:
        if os.path.exists(fallback):
            return fallback
    return None


def _run_cli(cli_path: str, prompt: str, backend: str) -> str:
    """Run a CLI tool and return stdout/final text."""
    if backend == 'codex':
        cmd = [
            cli_path, '-a', 'never', 'exec',
            '--skip-git-repo-check',
            '--ephemeral',
            '-s', 'read-only',
            '--json',
            '--color', 'never',
            prompt,
        ]
        return _extract_codex_json(_run_command_with_retries(cmd, backend))

    if backend == 'cursor' and cli_path.endswith('.ps1'):
        if _is_wsl():
            win_path = _wsl_to_winpath(cli_path)
            cmd = ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass',
                   '-File', win_path, '-p', prompt, '--output-format', 'text']
        else:
            cmd = ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass',
                   '-File', cli_path, '-p', prompt, '--output-format', 'text']
    else:
        cmd = [cli_path, '-p', prompt, '--output-format', 'text']

    return _run_command_with_retries(cmd, backend)


def _extract_codex_json(raw: str) -> str:
    last_message = ''
    for line in raw.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get('type') == 'item.completed':
            item = event.get('item') or {}
            if item.get('type') == 'agent_message':
                last_message = item.get('text') or ''
    return last_message.strip()


def _run_command_with_retries(cmd: list[str], backend: str) -> str:
    env = {k: v for k, v in os.environ.items()
           if k not in ('CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT')}

    retry_waits = [15, 30, 60]
    for attempt, wait in enumerate([0] + retry_waits):
        if wait:
            print(f"  rate limit, waiting {wait}s before retry {attempt}/{len(retry_waits)}...")
            time.sleep(wait)
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=120, env=env,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    raise RuntimeError(f"{backend} CLI failed after retries: {result.stderr.strip()}")


# ── Auto-detect & dispatch ───────────────────────────────────────────

def resolve_backend(requested: str) -> str:
    """Return 'claude', 'codex', or 'cursor' based on what's requested and available."""
    if requested == 'claude':
        if not get_claude_path():
            raise RuntimeError("--backend claude requested but claude CLI not found")
        return 'claude'
    if requested == 'codex':
        if not get_codex_path():
            raise RuntimeError("--backend codex requested but codex CLI not found")
        return 'codex'
    if requested == 'cursor':
        if not get_cursor_agent_path():
            raise RuntimeError("--backend cursor requested but cursor agent CLI not found")
        return 'cursor'
    # auto: prefer claude CLI, fall back to Codex CLI, then cursor agent
    if get_claude_path():
        return 'claude'
    if get_codex_path():
        return 'codex'
    if get_cursor_agent_path():
        return 'cursor'
    raise RuntimeError(
        "No backend available. Install claude CLI, codex CLI, or cursor agent CLI."
    )


def enrich_note(title: str, body: str, backend: str = 'auto') -> tuple[str, list[str]]:
    """Generate abstract + connect keywords using the chosen backend."""
    resolved = resolve_backend(backend)
    prompt = ENRICH_PROMPT_TEMPLATE.format(title=title, body=body[:3000])

    if resolved == 'claude':
        raw = _run_cli(get_claude_path(), prompt, 'claude')
    elif resolved == 'codex':
        raw = _run_cli(get_codex_path(), prompt, 'codex')
    else:
        raw = _run_cli(get_cursor_agent_path(), prompt, 'cursor')

    return _parse_enrich_response(raw)


def process_file(path: Path, dry_run: bool, force: bool, backend: str = 'auto') -> str:
    """
    Returns one of: 'skipped', 'enriched', 'error:<msg>'
    """
    try:
        content = path.read_text(encoding='utf-8')
        fm_text, body = parse_frontmatter(content)

        if fm_text is None:
            return 'skipped'

        abstract_empty = fm_field_is_empty(fm_text, 'abstract')
        connect_empty = fm_field_is_empty(fm_text, 'connect')

        if not force and not abstract_empty and not connect_empty:
            return 'skipped'

        title = path.stem
        abstract, connect = enrich_note(title, body, backend=backend)

        if not abstract or len(connect) < 1:
            return 'error:empty response from AI backend'

        new_fm = fm_text
        if force or abstract_empty:
            new_fm = set_fm_field_scalar(new_fm, 'abstract', abstract)
        if force or connect_empty:
            new_fm = set_fm_field_list(new_fm, 'connect', connect)

        new_content = f'---\n{new_fm}\n---\n{body}'

        if dry_run:
            print(f"\n--- PREVIEW ---")
            print(f"abstract: {abstract}")
            print(f"connect:")
            for kw in connect:
                print(f"  - {kw}")
            print(f"---------------\n")
        else:
            path.write_text(new_content, encoding='utf-8')

        return 'enriched'

    except Exception as e:
        return f'error:{e}'


def _needs_enrichment(path: Path, force: bool) -> bool:
    """Return True if a note still needs abstract/connect enrichment."""
    try:
        content = path.read_text(encoding='utf-8')
    except Exception:
        return False
    fm_text, _ = parse_frontmatter(content)
    if fm_text is None:
        return False
    if force:
        return True
    return fm_field_is_empty(fm_text, 'abstract') or fm_field_is_empty(fm_text, 'connect')


def main():
    parser = argparse.ArgumentParser(description='AI-enrich Obsidian notes')
    parser.add_argument('--vault', help='Path to Obsidian vault')
    parser.add_argument('--file', help='Process a single specific .md file')
    parser.add_argument('--dry-run', action='store_true',
                        help='Preview without writing')
    parser.add_argument('--force', action='store_true',
                        help='Overwrite existing abstract/connect')
    parser.add_argument('--limit', type=int, default=0,
                        help='Process at most N files (0 = all)')
    parser.add_argument('--backend', choices=['auto', 'claude', 'codex', 'cursor'], default='auto',
                        help='AI backend: auto (default, prefers claude then codex), claude (Claude Code CLI), codex (Codex CLI), cursor (Cursor agent CLI)')
    args = parser.parse_args()

    if not args.vault and not args.file:
        parser.error('provide --vault or --file')

    if args.file:
        file_path = Path(args.file).resolve()
        if not file_path.exists():
            print(f"ERROR: file not found: {args.file}", file=sys.stderr)
            sys.exit(1)
        all_md = [file_path]
        vault_root = Path(args.vault).resolve() if args.vault else file_path.parent
    else:
        vault_root = Path(args.vault).resolve()
        if not vault_root.exists():
            print(f"ERROR: vault not found: {vault_root}", file=sys.stderr)
            sys.exit(1)
        all_md = [p for p in vault_root.rglob('*.md') if p.is_file()
                  and not any(part.startswith('.') for part in p.parts)]

    backend = resolve_backend(args.backend)

    # Pre-filter: skip already-enriched notes before entering the main loop
    md_files = [p for p in all_md if _needs_enrichment(p, args.force)]
    pre_skipped = len(all_md) - len(md_files)

    if args.limit:
        md_files = md_files[:args.limit]

    total = len(md_files)
    enriched = errors = 0

    print(f"{'DRY RUN — ' if args.dry_run else ''}"
          f"Found {len(all_md)} note(s), {pre_skipped} already enriched → "
          f"processing {total} file(s)  [backend={backend}]")

    for i, path in enumerate(md_files, 1):
        try:
            rel = path.resolve().relative_to(vault_root)
        except ValueError:
            rel = path
        result = process_file(path, dry_run=args.dry_run, force=args.force, backend=backend)

        if result == 'enriched':
            enriched += 1
            print(f"[{i}/{total}] ✓ {rel}")
            time.sleep(3)
        elif result == 'skipped':
            print(f"[{i}/{total}] - {rel}  (skipped)")
        else:
            errors += 1
            print(f"[{i}/{total}] ✗ {rel}  ({result})", file=sys.stderr)

    print(f"\nDone. enriched={enriched}  pre-skipped={pre_skipped}  errors={errors}")


if __name__ == '__main__':
    main()
