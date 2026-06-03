import { Router } from 'express';
import { loadSourceNoteTemplate, saveSourceNoteTemplate } from '../services/source-note-template.js';

const router = Router();

router.get('/', async (_req, res) => {
  res.json(await loadSourceNoteTemplate());
});

router.put('/', async (req, res) => {
  try {
    const template = await saveSourceNoteTemplate(req.body?.template);
    res.json({ ok: true, template, configured: true });
  } catch (err) {
    res.status(400).json({ error: err.message || '文獻筆記模板儲存失敗' });
  }
});

export default router;

