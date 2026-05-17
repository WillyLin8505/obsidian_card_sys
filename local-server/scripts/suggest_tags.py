#!/usr/bin/env python3
"""
AI tag suggestion script.
Reads JSON from stdin: { "query": str, "availableTags": [str] }
Outputs JSON to stdout: { "suggestedTags": [str] } on success,
                        { "suggestedTags": [], "error": str } on failure.
Calls Claude CLI first, then falls back to Codex CLI when Claude is unavailable.
"""

import os
import sys
import json
import subprocess
import re
import shutil


def get_claude_path() -> str | None:
    # 1. Check environment variable override
    env_path = os.environ.get('CLAUDE_BIN')
    if env_path:
        return env_path
    # 2. Look for `claude` on PATH
    path = shutil.which('claude')
    if path:
        return path
    # 3. Common fallback for this project's development environment
    fallback = '/home/willylin/.npm-global/bin/claude'
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


def _clean_env() -> dict:
    return {k: v for k, v in os.environ.items() if k not in ('CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT')}


def _run_claude(prompt: str) -> str:
    claude_path = get_claude_path()
    if not claude_path:
        raise RuntimeError("claude CLI not found. Install it or set CLAUDE_BIN environment variable.")

    result = subprocess.run(
        [claude_path, '-p', prompt, '--output-format', 'text'],
        capture_output=True,
        text=True,
        timeout=30,
        env=_clean_env(),
    )

    if result.returncode != 0:
        raise RuntimeError(f"claude CLI failed: {result.stderr.strip()}")

    return result.stdout.strip()


def _run_codex(prompt: str) -> str:
    codex_path = get_codex_path()
    if not codex_path:
        raise RuntimeError("codex CLI not found. Install it or set CODEX_BIN environment variable.")

    result = subprocess.run(
        [
            codex_path, '-a', 'never', 'exec',
            '--skip-git-repo-check',
            '--ephemeral',
            '-s', 'read-only',
            '--json',
            '--color', 'never',
            prompt,
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )

    if result.returncode != 0:
        raise RuntimeError(f"codex CLI failed: {(result.stderr or result.stdout).strip()}")

    last_message = ''
    for line in result.stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get('type') == 'item.completed':
            item = event.get('item') or {}
            if item.get('type') == 'agent_message':
                last_message = item.get('text') or ''
    return last_message.strip()


def run_ai_prompt(prompt: str) -> str:
    try:
        return _run_claude(prompt)
    except Exception as claude_err:
        print(f"[suggest_tags] Claude unavailable, falling back to Codex: {claude_err}", file=sys.stderr)
        try:
            return _run_codex(prompt)
        except Exception as codex_err:
            raise RuntimeError(f"Claude and Codex CLI both failed. Claude: {claude_err} | Codex: {codex_err}")


def suggest_tags(query: str, available_tags: list) -> list:
    if not available_tags:
        return []

    tags_str = ', '.join(available_tags)
    prompt = (
        f"搜尋語意：{query}\n\n"
        f"可用標籤清單：{tags_str}\n\n"
        f"請從可用標籤清單中，盡量選出 5 個相關標籤（至少 3 個，除非可用標籤真的不足）。\n"
        f"選擇標準（依優先順序）：\n"
        f"1. 直接相關的標籤\n"
        f"2. 主題相鄰的標籤（同領域的延伸）\n"
        f"3. 概念上有關聯的標籤（廣義相關）\n"
        f"只回傳一個 JSON 陣列，格式如：[\"tag1\", \"tag2\"]。"
        f"不要加任何說明文字，只輸出 JSON 陣列。"
        f"若真的完全無相關標籤，回傳 []。"
    )

    raw = run_ai_prompt(prompt)

    # Extract JSON array from response (handles prose around the array)
    match = re.search(r'\[.*?\]', raw, re.DOTALL)
    if not match:
        return []

    try:
        parsed = json.loads(match.group())
    except json.JSONDecodeError:
        return []

    # Only return tags that exist in availableTags, max 5
    return [t for t in parsed if t in available_tags][:5]


def main():
    try:
        data = json.load(sys.stdin)
        query = data.get('query', '')
        if not isinstance(query, str):
            query = ''
        query = query.strip()

        available_tags = data.get('availableTags', [])
        if not isinstance(available_tags, list):
            available_tags = []

        if not query:
            print(json.dumps({'suggestedTags': [], 'error': 'query is required'}))
            sys.exit(1)

        suggested = suggest_tags(query, available_tags)
        print(json.dumps({'suggestedTags': suggested}))

    except Exception as e:
        print(json.dumps({'suggestedTags': [], 'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
