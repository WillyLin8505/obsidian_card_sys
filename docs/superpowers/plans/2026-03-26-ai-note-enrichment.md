# AI Note Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For every `.md` note in the Obsidian vault, auto-fill `abstract` (AI summary) and `connect` (5 linking keywords) in the YAML frontmatter using the Claude CLI.

**Architecture:** A standalone Python script walks the vault, parses each file's YAML frontmatter, skips notes that already have both fields filled, calls `claude -p` to generate abstract + connect, then rewrites only the frontmatter — leaving the note body untouched.

**Tech Stack:** Python 3.10+, `claude` CLI (same pattern as `suggest_tags.py`), standard-library `re`/`pathlib`/`argparse`.

---

## Frontmatter Format (from template)

Input (empty fields):
```yaml
---
abstract:
connect:
tags:
  - 3card/筆記法/卡片盒筆記法/靈感筆記
aliases:
create date: 2026-02-21
---
```

Output (filled):
```yaml
---
abstract: 這篇筆記探討了XXX的核心概念，說明了YYY的重要性。
connect:
  - 關鍵字1
  - 關鍵字2
  - 關鍵字3
  - 關鍵字4
  - 關鍵字5
tags:
  - 3card/筆記法/卡片盒筆記法/靈感筆記
aliases:
create date: 2026-02-21
---
```

---

## Files

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `local-server/scripts/enrich_notes.py` | Main batch enrichment script |

No other files need to be modified.

---

## Task 1: Write the frontmatter parser

**Files:**
- Create: `local-server/scripts/enrich_notes.py`

- [ ] **Step 1: Create the script with frontmatter parse/replace helpers**

```python
#!/usr/bin/env python3
"""
Batch AI note enrichment script.
Fills `abstract` and `connect` fields in YAML frontmatter for every .md file.

Usage:
  python enrich_notes.py --vault /mnt/d/obsidian/personal_willy
  python enrich_notes.py --vault /mnt/d/obsidian/personal_willy --dry-run
  python enrich_notes.py --vault /mnt/d/obsidian/personal_willy --force
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import json
from pathlib import Path


FM_RE = re.compile(r'^---\s*\n([\s\S]*?)\n---\s*\n?', re.MULTILINE)


def parse_frontmatter(content: str) -> tuple[dict, str] | tuple[None, str]:
    """Return (raw_fm_text, body) or (None, full_content) if no frontmatter."""
    m = FM_RE.match(content)
    if not m:
        return None, content
    return m.group(1), content[m.end():]


def fm_field_is_empty(fm_text: str, field: str) -> bool:
    """Return True if the field exists but has no value (e.g. 'abstract:')."""
    pattern = re.compile(rf'^{re.escape(field)}:\s*$', re.MULTILINE)
    return bool(pattern.search(fm_text))


def set_fm_field_scalar(fm_text: str, field: str, value: str) -> str:
    """Replace 'field:' or 'field: old' with 'field: value'."""
    pattern = re.compile(rf'^({re.escape(field)}):.*$', re.MULTILINE)
    replacement = f'{field}: {value}'
    if pattern.search(fm_text):
        return pattern.sub(replacement, fm_text, count=1)
    return fm_text + f'\n{replacement}'


def set_fm_field_list(fm_text: str, field: str, items: list[str]) -> str:
    """Replace 'field:' or 'field: ...' (including multiline list) with a YAML list block."""
    # Remove existing field (scalar or block list)
    block_pattern = re.compile(
        rf'^{re.escape(field)}:.*?(?=\n\S|\Z)', re.MULTILINE | re.DOTALL
    )
    yaml_list = f'{field}:\n' + '\n'.join(f'  - {item}' for item in items)
    if block_pattern.search(fm_text):
        return block_pattern.sub(yaml_list, fm_text, count=1)
    return fm_text + f'\n{yaml_list}'
```

- [ ] **Step 2: Verify the helpers parse the template correctly (manual check)**

Run a quick sanity check in Python REPL:
```python
content = open("/mnt/d/obsidian/personal_willy/Extras/1_Templates/靈感筆記- Template.md").read()
fm, body = parse_frontmatter(content)
print(repr(fm))
assert fm_field_is_empty(fm, "abstract")
assert fm_field_is_empty(fm, "connect")
print("OK")
```

---

## Task 2: Add Claude CLI call + main logic

**Files:**
- Modify: `local-server/scripts/enrich_notes.py`

- [ ] **Step 3: Add `get_claude_path()` (copy pattern from `suggest_tags.py`)**

```python
def get_claude_path() -> str:
    env_path = os.environ.get('CLAUDE_BIN')
    if env_path:
        return env_path
    path = shutil.which('claude')
    if path:
        return path
    fallback = '/home/willylin/.npm-global/bin/claude'
    if os.path.exists(fallback):
        return fallback
    raise RuntimeError("claude CLI not found. Install it or set CLAUDE_BIN.")
```

- [ ] **Step 4: Add `enrich_note()` — calls Claude, returns (abstract, connect_list)**

```python
def enrich_note(title: str, body: str) -> tuple[str, list[str]]:
    """Call Claude CLI to generate abstract (1-2 sentences) and 5 connect keywords."""
    prompt = (
        f"以下是一則 Obsidian 筆記，標題為「{title}」：\n\n"
        f"{body[:3000]}\n\n"
        "請做兩件事：\n"
        "1. 用繁體中文寫一段 1-2 句的摘要（abstract），簡明扼要說明這篇筆記的核心概念。\n"
        "2. 列出 5 個最有可能與其他筆記產生連結的關鍵字詞（connect），用繁體中文，每個 2-6 字。\n\n"
        "只輸出 JSON，格式如下（不要加任何說明）：\n"
        '{"abstract": "摘要文字", "connect": ["詞1", "詞2", "詞3", "詞4", "詞5"]}'
    )

    env = {k: v for k, v in os.environ.items()
           if k not in ('CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT')}

    result = subprocess.run(
        [get_claude_path(), '-p', prompt, '--output-format', 'text'],
        capture_output=True, text=True, timeout=60, env=env,
    )

    if result.returncode != 0:
        raise RuntimeError(f"claude CLI failed: {result.stderr.strip()}")

    raw = result.stdout.strip()
    # Extract JSON object from response
    m = re.search(r'\{[\s\S]*\}', raw)
    if not m:
        raise RuntimeError(f"No JSON in response: {raw[:200]}")

    data = json.loads(m.group())
    abstract = str(data.get('abstract', '')).strip()
    connect = [str(c).strip() for c in data.get('connect', [])][:5]
    return abstract, connect
```

- [ ] **Step 5: Add `process_file()` — reads, checks, enriches, writes**

```python
def process_file(path: Path, dry_run: bool, force: bool) -> str:
    """
    Returns one of: 'skipped', 'enriched', 'error:<msg>'
    """
    try:
        content = path.read_text(encoding='utf-8')
        fm_text, body = parse_frontmatter(content)

        if fm_text is None:
            return 'skipped'  # No frontmatter at all

        abstract_empty = fm_field_is_empty(fm_text, 'abstract')
        connect_empty = fm_field_is_empty(fm_text, 'connect')

        if not force and not abstract_empty and not connect_empty:
            return 'skipped'  # Already filled

        title = path.stem
        abstract, connect = enrich_note(title, body)

        if not abstract or len(connect) < 1:
            return 'error:empty response from Claude'

        new_fm = fm_text
        if force or abstract_empty:
            new_fm = set_fm_field_scalar(new_fm, 'abstract', abstract)
        if force or connect_empty:
            new_fm = set_fm_field_list(new_fm, 'connect', connect)

        new_content = f'---\n{new_fm}\n---\n{body}'

        if not dry_run:
            path.write_text(new_content, encoding='utf-8')

        return 'enriched'

    except Exception as e:
        return f'error:{e}'
```

- [ ] **Step 6: Add `main()` with argparse**

```python
def main():
    parser = argparse.ArgumentParser(description='AI-enrich Obsidian notes')
    parser.add_argument('--vault', required=True, help='Path to Obsidian vault')
    parser.add_argument('--dry-run', action='store_true',
                        help='Preview without writing')
    parser.add_argument('--force', action='store_true',
                        help='Overwrite existing abstract/connect')
    parser.add_argument('--limit', type=int, default=0,
                        help='Process at most N files (0 = all)')
    args = parser.parse_args()

    vault = Path(args.vault)
    if not vault.exists():
        print(f"ERROR: vault not found: {vault}", file=sys.stderr)
        sys.exit(1)

    md_files = [p for p in vault.rglob('*.md') if p.is_file()
                and not any(part.startswith('.') for part in p.parts)]

    if args.limit:
        md_files = md_files[:args.limit]

    total = len(md_files)
    enriched = skipped = errors = 0

    print(f"{'DRY RUN — ' if args.dry_run else ''}Processing {total} files in {vault}")

    for i, path in enumerate(md_files, 1):
        rel = path.relative_to(vault)
        result = process_file(path, dry_run=args.dry_run, force=args.force)

        if result == 'enriched':
            enriched += 1
            print(f"[{i}/{total}] ✓ {rel}")
        elif result == 'skipped':
            skipped += 1
            # print(f"[{i}/{total}] - {rel}  (skipped)")  # uncomment for verbose
        else:
            errors += 1
            print(f"[{i}/{total}] ✗ {rel}  ({result})", file=sys.stderr)

    print(f"\nDone. enriched={enriched}  skipped={skipped}  errors={errors}")


if __name__ == '__main__':
    main()
```

---

## Task 3: Test and run

- [ ] **Step 7: Dry-run on 3 files to verify output**

```bash
cd /mnt/c/Users/sssss/OneDrive/personal_desk_file/Desktop/vibe_coding_project/Card_Box_Note_Management
python local-server/scripts/enrich_notes.py \
  --vault /mnt/d/obsidian/personal_willy \
  --dry-run \
  --limit 3
```

Expected output:
```
DRY RUN — Processing 3 files in /mnt/d/obsidian/personal_willy
[1/3] ✓ SomeNote.md
[2/3] ✓ AnotherNote.md
[3/3] - AlreadyFilled.md  (skipped)

Done. enriched=2  skipped=1  errors=0
```

- [ ] **Step 8: Inspect one of the 3 files to verify correct frontmatter format**

Open the file in Obsidian or run:
```bash
head -20 "/mnt/d/obsidian/personal_willy/<the note name>.md"
```

Confirm `abstract:` has a sentence and `connect:` has 5 list items.

- [ ] **Step 9: Run for real on the full vault**

```bash
python local-server/scripts/enrich_notes.py \
  --vault /mnt/d/obsidian/personal_willy
```

This will skip already-filled notes. Re-run with `--force` to overwrite.

- [ ] **Step 10: Commit**

```bash
git add local-server/scripts/enrich_notes.py
git commit -m "feat: add AI note enrichment script for abstract and connect fields"
```

---

## Notes

- **Rate / cost:** Each note = 1 Claude CLI call. For large vaults (500+ notes) this can take 20-40 minutes and use significant API tokens. Use `--limit N` to batch-process gradually.
- **Safety:** The script only rewrites files where `abstract:` or `connect:` are empty (unless `--force`). Your note bodies are never changed.
- **Re-running:** Safe to re-run anytime — already-filled notes are skipped by default.
- **Encoding:** All files are read/written as UTF-8.
