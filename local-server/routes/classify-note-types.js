import { Router } from 'express';
import { runAiCliText } from '../services/ai-cli.js';

const router = Router();
const MAX_AI_CATEGORIES = 5;

function extractAbstract(content) {
  const text = String(content || '');
  const match = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return '';
  const abstractMatch = match[1].match(/^abstract:\s*(.+)$/m);
  return abstractMatch ? abstractMatch[1].trim() : '';
}

function compactNote(note) {
  const title = String(note.title || note.id || '未命名筆記').trim();
  const tags = Array.isArray(note.tags) ? note.tags.filter(Boolean).join(', ') : '';
  const abstract = String(note.abstract || extractAbstract(note.content)).replace(/\s+/g, ' ').trim().slice(0, 300);
  return {
    id: String(note.id || title),
    title,
    tags,
    abstract,
  };
}

function normalizeCategory(value) {
  const category = String(value || '').trim();
  return category || '其他';
}

function limitCategories(categories) {
  const normalized = categories.map(item => ({ ...item, category: normalizeCategory(item.category) }));
  const distinct = [...new Set(normalized.map(item => item.category))];
  if (distinct.length <= MAX_AI_CATEGORIES) return normalized;

  const counts = new Map();
  normalized.forEach(item => {
    if (item.category !== '其他') {
      counts.set(item.category, (counts.get(item.category) || 0) + 1);
    }
  });

  const kept = new Set(
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'))
      .slice(0, MAX_AI_CATEGORIES - 1)
      .map(([category]) => category),
  );

  return normalized.map(item => ({
    ...item,
    category: item.category === '其他' || kept.has(item.category) ? item.category : '其他',
  }));
}

router.post('/', async (req, res) => {
  const notes = Array.isArray(req.body?.notes) ? req.body.notes.map(compactNote).filter(n => n.id) : [];
  if (notes.length === 0) {
    return res.status(400).json({ error: 'notes 必須是非空陣列' });
  }
  if (notes.length > 120) {
    return res.status(400).json({ error: '一次最多分類 120 則筆記' });
  }

  const noteList = notes.map((note, index) => (
    `### ${index + 1}. ${note.title}\n` +
    `id: ${note.id}\n` +
    (note.tags ? `tags: ${note.tags}\n` : '') +
    (note.abstract ? `abstract: ${note.abstract}\n` : '')
  )).join('\n');

  const prompt =
    `你是個人知識管理助手。請把以下筆記依「主題/領域種類」分類，種類數量最多 ${MAX_AI_CATEGORIES} 種。\n` +
    `分類名稱要短，使用繁體中文，適合做連結圖譜 filter，例如「學習方法」「健康身體」「人際關係」。\n` +
    `如果超過 ${MAX_AI_CATEGORIES} 種，請合併成較大的主題；不要使用「其他」除非真的無法判斷。\n\n` +
    `只輸出 JSON 陣列，不加說明文字。格式如下：\n` +
    `[{"id":"原始 id","category":"種類名稱"}, ...]\n\n` +
    `筆記清單：\n\n${noteList}`;

  try {
    const { text: raw } = await runAiCliText(prompt, {
      label: 'classify-note-types',
      claudeModel: 'claude-haiku-4-5-20251001',
      timeoutMs: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      return res.status(500).json({ error: '無法從 AI 回應解析 JSON 陣列' });
    }

    let parsed;
    try {
      parsed = JSON.parse(arrayMatch[0]);
    } catch {
      return res.status(500).json({ error: 'AI 回應 JSON 解析失敗' });
    }

    if (!Array.isArray(parsed)) {
      return res.status(500).json({ error: 'AI 回應不是陣列格式' });
    }

    const validIds = new Set(notes.map(note => note.id));
    const categories = parsed
      .map(item => ({
        id: String(item?.id || '').trim(),
        category: String(item?.category || '').trim(),
      }))
      .filter(item => validIds.has(item.id) && item.category);

    const categorizedIds = new Set(categories.map(item => item.id));
    notes.forEach(note => {
      if (!categorizedIds.has(note.id)) {
        categories.push({ id: note.id, category: '其他' });
      }
    });

    res.json({ categories: limitCategories(categories) });
  } catch (err) {
    console.error('[classify-note-types] failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
