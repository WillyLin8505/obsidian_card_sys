import { Router } from 'express';

const router = Router();

const SEARCH_SERVER_URL = process.env.SEARCH_SERVER_URL || 'http://127.0.0.1:8765';

async function llamaSearch(question, topK = 30) {
  const res = await fetch(`${SEARCH_SERVER_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, top_k: topK }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`search-server ${res.status}: ${text}`);
  }

  return res.json();
}

router.post('/', async (req, res) => {
  const { question } = req.body;

  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: '請提供搜尋問題 (question)' });
  }

  const startTime = Date.now();

  try {
    const data = await llamaSearch(question.trim());

    data.searchTime = Date.now() - startTime;

    res.json(data);
  } catch (err) {
    console.error('[search] llama-search failed:', err.message);

    // 若 Python server 未啟動，給出明確提示
    if (err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')) {
      return res.status(503).json({
        error: 'Search server 未啟動，請執行：cd llama-search && python search_server.py',
      });
    }

    res.status(500).json({ error: err.message });
  }
});

export default router;
