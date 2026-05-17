#!/usr/bin/env python3
"""
AI linked note generation script.
Reads JSON from stdin: { "notes": [{"title": str, "content": str}], "model": str }
Outputs JSON to stdout: { "title": str, "content": str } on success,
                        { "title": "", "content": "", "error": str } on failure.
Calls `claude -p` CLI to generate a new linked note using the specified thinking model.
Thinking model definitions are loaded from .claude/skills/<skill-name>/SKILL.md at runtime.
"""

import os
import sys
import json
import subprocess
import re
import shutil
from pathlib import Path
from datetime import datetime


# Script: local-server/scripts/generate_linked_notes.py
# Skills: .claude/skills/<skill-name>/SKILL.md  (2 levels up from scripts/)
_SKILLS_DIR = Path(__file__).parent.parent.parent / '.claude' / 'skills'

MODEL_TO_SKILL = {
    '第一性原理': 'first-principles',
    '六頂思考帽': 'six-thinking-hats',
    '5個Why':    'five-whys',
    'SWOT分析':  'swot-analysis',
    '冰山模型':  'iceberg-model',
    'AQAL模型':  'aqal-model',
    '賽局理論':  'game-theory',
    '矩陣分析法': 'matrix-analysis',
    '類比思考':  'analogical-thinking',
    '二階思考':  'second-order-thinking',
}

_JSON_FORMAT = (
    '輸出格式（JSON，只輸出 JSON，不要加任何說明文字）：\n'
    '{"title": "...", "abstract": "1-2句摘要說明這篇分析的核心洞見", '
    '"connect": ["來源筆記標題1", "來源筆記標題2"], "content": "Markdown 內容"}'
)


def load_skill_content(model: str) -> str | None:
    """Load SKILL.md for the given model. Returns None if not found."""
    skill_name = MODEL_TO_SKILL.get(model)
    if not skill_name:
        return None
    skill_path = _SKILLS_DIR / skill_name / 'SKILL.md'
    if not skill_path.exists():
        return None
    return skill_path.read_text(encoding='utf-8')


def build_prompt(model: str, notes_text: str) -> str:
    skill_content = load_skill_content(model)
    if skill_content:
        return (
            f'你是一個知識分析助手。請使用以下思考框架對筆記進行深度分析，並生成一篇結構完整的連結筆記。\n\n'
            f'## 思考框架定義：{model}\n\n'
            f'{skill_content}\n\n'
            f'---\n\n'
            f'## 任務指示\n\n'
            f'根據上述「{model}」框架，分析下方筆記，嚴格遵循框架的 Layer 3（執行步驟）與 Layer 4（輸出規格）。\n'
            f'title 格式：「{model}：[主題]」\n\n'
            f'{_JSON_FORMAT}\n\n'
            f'## 待分析的筆記\n\n'
            f'{notes_text}'
        )
    # Fallback for any model without a SKILL.md
    return (
        f'請用「{model}」思考框架分析以下筆記，並生成一篇連結筆記。\n'
        f'title 格式：「{model}：[主題]」\n'
        f'{_JSON_FORMAT}\n\n'
        f'{notes_text}'
    )


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
    raise RuntimeError(
        "claude CLI not found. Install it or set CLAUDE_BIN environment variable."
    )


def prepare_note_for_ai(note: dict) -> str:
    """Strip raw YAML frontmatter syntax; present key metadata as readable text."""
    title = note.get('title', '')
    content = note.get('content', '')

    # Remove YAML frontmatter block
    body = re.sub(r'^---\s*\n[\s\S]*?\n---\s*\n?', '', content).strip()

    # Extract abstract and tags from frontmatter for context
    abstract_match = re.search(r'^abstract:\s*(.+)$', content, re.MULTILINE)
    tags_block = re.search(r'^tags:\s*\n((?:[ \t]+-[^\n]*\n?)+)', content, re.MULTILINE)
    tags_inline = re.search(r'^tags:\s*\[([^\]]+)\]', content, re.MULTILINE)

    meta_lines = []
    if abstract_match:
        meta_lines.append(f'摘要：{abstract_match.group(1).strip()}')
    if tags_block:
        tags = [t.strip().lstrip('- ') for t in tags_block.group(1).splitlines() if t.strip()]
        if tags:
            meta_lines.append(f'標籤：{", ".join(tags)}')
    elif tags_inline:
        tags = [t.strip() for t in tags_inline.group(1).split(',') if t.strip()]
        if tags:
            meta_lines.append(f'標籤：{", ".join(tags)}')

    parts = [f'## {title}']
    if meta_lines:
        parts.extend(meta_lines)
        parts.append('')
    parts.append(body)
    return '\n'.join(parts)


def generate_note(notes: list, model: str) -> dict:
    if model not in MODEL_TO_SKILL:
        raise ValueError(f"未知的思考模型: {model}（支援：{', '.join(MODEL_TO_SKILL)}）")

    notes_text = '\n\n---\n\n'.join(prepare_note_for_ai(n) for n in notes)
    prompt = build_prompt(model, notes_text)

    env = {k: v for k, v in os.environ.items() if k not in ('CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT')}
    result = subprocess.run(
        [get_claude_path(), '-p', prompt, '--output-format', 'text'],
        capture_output=True,
        text=True,
        timeout=120,
        env=env,
    )

    if result.returncode != 0:
        raise RuntimeError(f"claude CLI failed: {result.stderr.strip()}")

    raw = result.stdout.strip()

    # Extract JSON object from response
    match = re.search(r'\{[\s\S]*\}', raw)
    if not match:
        # Fallback: treat entire output as content
        today = datetime.now().strftime('%Y-%m-%d')
        return {
            'title': f'{model}分析 {today}',
            'abstract': '',
            'connect': [],
            'content': raw,
        }

    try:
        parsed = json.loads(match.group())
        return {
            'title': str(parsed.get('title', f'{model}分析')),
            'abstract': str(parsed.get('abstract', '')),
            'connect': parsed.get('connect', []) if isinstance(parsed.get('connect'), list) else [],
            'content': str(parsed.get('content', raw)),
        }
    except json.JSONDecodeError:
        today = datetime.now().strftime('%Y-%m-%d')
        return {
            'title': f'{model}分析 {today}',
            'abstract': '',
            'connect': [],
            'content': raw,
        }


def main():
    try:
        data = json.load(sys.stdin)
        notes = data.get('notes', [])
        model = data.get('model', '')

        if not notes:
            print(json.dumps({'title': '', 'content': '', 'error': 'notes is required'}))
            sys.exit(1)

        if not model:
            print(json.dumps({'title': '', 'content': '', 'error': 'model is required'}))
            sys.exit(1)

        result = generate_note(notes, model)
        print(json.dumps(result, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({'title': '', 'content': '', 'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
