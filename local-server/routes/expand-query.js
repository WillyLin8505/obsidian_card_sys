import { Router } from 'express';
import { runAiCliText } from '../services/ai-cli.js';

const router = Router();

router.post('/', async (req, res) => {
  const { query } = req.body;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: '請提供搜尋文字 (query)' });
  }

  const prompt =
    `請將以下查詢展開為 5–10 個語義相關的繁體中文搜尋關鍵字（每個 2–6 個字），` +
    `只回傳 JSON 陣列，不要解釋，格式：["關鍵字1","關鍵字2",...]。` +
    `查詢：${query.trim()}`;

  try {
    const keywords = await runAiCliJsonArray(prompt);
    console.log('[expand-query] query:', query.trim(), '→', keywords);
    res.json({ keywords });
  } catch (err) {
    console.error('[expand-query] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function runAiCliJsonArray(prompt) {
  const { text } = await runAiCliText(prompt, {
    label: 'expand-query',
    timeoutMs: 90_000,
    maxBuffer: 5 * 1024 * 1024,
  });

  // 從輸出中抽取 JSON 陣列
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) {
    throw new Error(`無法從 AI 輸出解析 JSON 陣列: ${text.trim()}`);
  }

  try {
    const keywords = JSON.parse(match[0]);
    if (!Array.isArray(keywords)) throw new Error('不是陣列');
    return keywords.filter((k) => typeof k === 'string' && k.trim());
  } catch (e) {
    throw new Error(`JSON 解析失敗: ${e.message}`);
  }
}

export default router;
