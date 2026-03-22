import { Router } from 'express';
import { qmdHealthCheck } from '../services/qmd.js';

const router = Router();

router.get('/', async (req, res) => {
  const qmd = await qmdHealthCheck();

  const claudeApiKey = process.env.CLAUDE_API_KEY;
  const claudeConfigured = Boolean(claudeApiKey && claudeApiKey.startsWith('sk-ant-'));

  res.json({
    ok: qmd.ok && claudeConfigured,
    qmd: {
      ok: qmd.ok,
      version: qmd.version,
      message: qmd.ok ? `QMD ${qmd.version}` : 'QMD not found — run: pip install qmd',
    },
    claude: {
      ok: claudeConfigured,
      message: claudeConfigured ? 'API key configured' : 'CLAUDE_API_KEY not set',
    },
    server: {
      ok: true,
      message: 'Local server running',
    },
  });
});

export default router;
