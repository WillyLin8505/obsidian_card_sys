import { Router } from 'express';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runAiCliText } from '../services/ai-cli.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '../../.claude/skills');

const MODEL_TO_SKILL = {
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
};

// Load only Layer 3 (execution steps) — Layer 4 output spec and Layer 5 are omitted.
// Shorter prompt = fewer tokens = faster Haiku response.
function loadLayer3(skillName) {
  const skillPath = join(SKILLS_DIR, skillName, 'SKILL.md');
  if (!existsSync(skillPath)) return null;

  let text = readFileSync(skillPath, 'utf-8');
  text = text.replace(/^---[\s\S]*?---\n/, ''); // strip YAML frontmatter
  const match = text.match(/## Layer 3:[\s\S]*?(?=## Layer 4:|$)/);
  return match ? match[0].trim() : null;
}

function prepareNote(note) {
  const title = note.title || '（無標題）';
  const raw = note.content || '';

  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const body = fmMatch ? raw.slice(fmMatch[0].length).trim() : raw.trim();

  const lines = [`## ${title}`];

  if (fmMatch) {
    const fm = fmMatch[1];

    const abstractMatch = fm.match(/^abstract:\s*(.+)$/m);
    if (abstractMatch) lines.push(`摘要：${abstractMatch[1].trim()}`);

    const tagsBlock = fm.match(/^tags:\s*\n((?:[ \t]+-[^\n]*\n?)+)/m);
    const tagsInline = fm.match(/^tags:\s*\[([^\]]+)\]/m);
    if (tagsBlock) {
      const tags = tagsBlock[1].split('\n').map(t => t.trim().replace(/^-\s*/, '')).filter(Boolean);
      if (tags.length) lines.push(`標籤：${tags.join(', ')}`);
    } else if (tagsInline) {
      const tags = tagsInline[1].split(',').map(t => t.trim()).filter(Boolean);
      if (tags.length) lines.push(`標籤：${tags.join(', ')}`);
    }

    const connectBlock = fm.match(/^connect:\s*\n((?:[ \t]+-[^\n]*\n?)+)/m);
    if (connectBlock) {
      const connects = connectBlock[1].split('\n').map(t => t.trim().replace(/^-\s*/, '')).filter(Boolean);
      if (connects.length) lines.push(`連結筆記：${connects.join(', ')}`);
    }
  }

  if (body) {
    lines.push('');
    lines.push(body);
  }

  return lines.join('\n');
}

const router = Router();

// POST /generate-linked-notes
// Body: { notes: [{title, content}], models: [str] }
// Response: { generatedNotes: [{ model, title, abstract, connect, content }] }
router.post('/', async (req, res) => {
  const { notes, models } = req.body;

  if (!Array.isArray(notes) || notes.length === 0) {
    return res.status(400).json({ error: 'notes 必須是非空陣列' });
  }
  if (!Array.isArray(models) || models.length === 0) {
    return res.status(400).json({ error: 'models 必須是非空陣列' });
  }

  const notesText = notes.map(prepareNote).join('\n\n---\n\n');

  // One section per framework — Layer 3 steps only to minimize token count
  const frameworkSections = models.map((model, i) => {
    const skillName = MODEL_TO_SKILL[model];
    const layer3 = skillName ? loadLayer3(skillName) : null;
    return layer3
      ? `### 框架 ${i + 1}：${model}\n\n${layer3}`
      : `### 框架 ${i + 1}：${model}\n\n請用此框架的核心邏輯進行分析。title 格式：「${model}：[主題]」`;
  }).join('\n\n---\n\n');

  // Single prompt — all frameworks in one CLI call.
  // CLI starts once; API call is one round trip regardless of model count.
  const prompt =
    `【語言規定】所有輸出必須使用繁體中文，嚴禁使用簡體字。\n\n` +
    `你是知識分析助手。請依序用以下 ${models.length} 個思考框架分析筆記，` +
    `輸出長度為 ${models.length} 的 JSON 陣列，只輸出 JSON，不加任何說明文字。\n\n` +
    `${frameworkSections}\n\n` +
    `---\n\n` +
    `## 輸出格式（JSON 陣列）\n\n` +
    `每個元素對應一個框架，順序與上方一致：\n` +
    `[{"title":"框架名：主題","abstract":"1-2句核心洞見","connect":["來源筆記標題"],"content":"Markdown 內容"}, ...]\n\n` +
    `**重要**：content 欄位控制在 500 字以內；Markdown 標題前後加空行；全程繁體中文。\n\n` +
    `## 待分析的筆記\n\n${notesText}`;

  try {
    const { text: raw } = await runAiCliText(prompt, {
      label: 'generate-linked-notes',
      claudeModel: 'claude-haiku-4-5-20251001',
      timeoutMs: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const arrayMatch = raw.match(/\[[\s\S]*\]/);

    if (!arrayMatch) {
      return res.status(500).json({ error: '無法從回應中解析 JSON 陣列' });
    }

    let parsed;
    try {
      parsed = JSON.parse(arrayMatch[0]);
    } catch {
      return res.status(500).json({ error: 'JSON 解析失敗' });
    }

    if (!Array.isArray(parsed)) {
      return res.status(500).json({ error: '回應不是陣列格式' });
    }

    const generatedNotes = models.map((model, i) => {
      const item = parsed[i] ?? {};
      return {
        model,
        title:    String(item.title   ?? `${model}分析`),
        abstract: String(item.abstract ?? ''),
        connect:  Array.isArray(item.connect) ? item.connect : [],
        content:  String(item.content  ?? ''),
      };
    });

    res.json({ generatedNotes });
  } catch (err) {
    console.error('[generate-linked-notes] failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
