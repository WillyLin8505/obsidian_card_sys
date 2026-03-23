import { Router } from 'express';
import { runPythonScript } from '../services/python_runner.js';

const router = Router();

router.post('/', async (req, res) => {
  const { query, availableTags } = req.body;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: '請提供搜尋文字 (query)' });
  }
  if (!Array.isArray(availableTags)) {
    return res.status(400).json({ error: 'availableTags 必須是陣列' });
  }

  // 若無可用 tags，直接回傳空陣列（不呼叫 Python）
  if (availableTags.length === 0) {
    return res.json({ suggestedTags: [] });
  }

  try {
    const result = await runPythonScript('suggest_tags.py', {
      query: query.trim(),
      availableTags,
    });
    res.json({ suggestedTags: result.suggestedTags || [] });
  } catch (err) {
    console.error('[suggest-tags] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
