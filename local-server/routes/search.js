import { Router } from 'express';
import { qmdQuery } from '../services/qmd.js';

const router = Router();

router.post('/', async (req, res) => {
  const { question } = req.body;

  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: '請提供搜尋問題 (question)' });
  }

  const startTime = Date.now();

  try {
    const { chunks } = await qmdQuery(question.trim());
    const searchTime = Date.now() - startTime;

    res.json({
      id: `search_${Date.now()}`,
      question: question.trim(),
      answer: '',
      chunks,
      connectionStatus: 'connected',
      searchTime,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[search] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
