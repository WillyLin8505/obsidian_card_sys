import { Router } from 'express';
import { getClaudePath } from '../services/ai-cli.js';

const router = Router();
const SEARCH_SERVER_URL = process.env.SEARCH_SERVER_URL || 'http://127.0.0.1:8765';

async function searchHealthCheck() {
  try {
    const started = Date.now();
    const response = await fetch(`${SEARCH_SERVER_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'healthcheck', top_k: 1 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, message: `llama-search ${response.status}: ${text || response.statusText}` };
    }
    return { ok: true, message: `llama-search connected (${Date.now() - started}ms)` };
  } catch (err) {
    return { ok: false, message: `llama-search unavailable: ${err.message}` };
  }
}

router.get('/', async (req, res) => {
  const search = await searchHealthCheck();
  const claudePath = getClaudePath();

  res.json({
    ok: true,
    search,
    claude: {
      ok: Boolean(claudePath),
      message: claudePath ? `Claude CLI: ${claudePath}` : 'Claude CLI not found',
    },
    server: {
      ok: true,
      message: 'Local server running',
    },
  });
});

export default router;
