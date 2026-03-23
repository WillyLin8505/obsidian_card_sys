#!/usr/bin/env python3
"""
AI tag suggestion script.
Reads JSON from stdin: { "query": str, "availableTags": [str] }
Outputs JSON to stdout: { "suggestedTags": [str] }
Calls `claude -p` CLI to generate suggestions.
"""

import sys
import json
import subprocess
import re

def suggest_tags(query: str, available_tags: list[str]) -> list[str]:
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
        ['/home/willylin/.npm-global/bin/claude', '-p', prompt, '--output-format', 'text'],
        capture_output=True,
        text=True,
        timeout=30
    )

    if result.returncode != 0:
        raise RuntimeError(f"claude CLI failed: {result.stderr.strip()}")

    raw = result.stdout.strip()

    # Extract JSON array from response
    match = re.search(r'\[.*?\]', raw, re.DOTALL)
    if not match:
        return []

    parsed = json.loads(match.group())
    # Only return tags that exist in availableTags
    return [t for t in parsed if t in available_tags][:5]


def main():
    data = json.load(sys.stdin)
    query = data.get('query', '').strip()
    available_tags = data.get('availableTags', [])

    if not query:
        print(json.dumps({'suggestedTags': [], 'error': 'query is required'}))
        sys.exit(1)

    suggested = suggest_tags(query, available_tags)
    print(json.dumps({'suggestedTags': suggested}))


if __name__ == '__main__':
    main()
