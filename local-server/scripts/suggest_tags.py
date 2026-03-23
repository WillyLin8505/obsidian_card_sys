#!/usr/bin/env python3
"""
AI tag suggestion script.
Reads JSON from stdin: { "query": str, "availableTags": [str] }
Outputs JSON to stdout: { "suggestedTags": [str] } on success,
                        { "suggestedTags": [], "error": str } on failure.
Calls `claude -p` CLI to generate suggestions.
"""

import os
import sys
import json
import subprocess
import re
import shutil


def get_claude_path() -> str:
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
    import os.path
    if os.path.exists(fallback):
        return fallback
    raise RuntimeError(
        "claude CLI not found. Install it or set CLAUDE_BIN environment variable."
    )


def suggest_tags(query: str, available_tags: list) -> list:
    if not available_tags:
        return []

    tags_str = ', '.join(available_tags)
    prompt = (
        f"搜尋語意：{query}\n\n"
        f"可用標籤清單：{tags_str}\n\n"
        f"請從可用標籤清單中，選出最符合搜尋語意的標籤（最多 5 個）。"
        f"只回傳一個 JSON 陣列，格式如：[\"tag1\", \"tag2\"]。"
        f"不要加任何說明文字，只輸出 JSON 陣列。"
        f"若無相關標籤，回傳 []。"
    )

    result = subprocess.run(
        [get_claude_path(), '-p', prompt, '--output-format', 'text'],
        capture_output=True,
        text=True,
        timeout=30
    )

    if result.returncode != 0:
        raise RuntimeError(f"claude CLI failed: {result.stderr.strip()}")

    raw = result.stdout.strip()

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
