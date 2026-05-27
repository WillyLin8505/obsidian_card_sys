import 'dotenv/config';
import express from 'express';

const PORT = process.env.IOS_SHARE_GATEWAY_PORT || 3010;
const HOST = process.env.IOS_SHARE_GATEWAY_HOST || '127.0.0.1';
const LOCAL_API_BASE = (process.env.IOS_SHARE_INTERNAL_API_URL || `http://127.0.0.1:${process.env.PORT || 3001}`).replace(/\/$/, '');
const IOS_SHARE_TOKEN = process.env.IOS_SHARE_TOKEN || '';

if (!IOS_SHARE_TOKEN) {
  console.error('安全設定不足：請在 local-server/.env 設定 IOS_SHARE_TOKEN 後再啟動 iOS share gateway。');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '256kb' }));

function requireToken(req, res, next) {
  const auth = req.get('authorization') || '';
  const token = req.get('x-ios-share-token') || auth.replace(/^Bearer\s+/i, '') || req.query.token;
  if (token === IOS_SHARE_TOKEN) return next();
  return res.status(401).json({ error: 'Unauthorized iOS share request' });
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ios-share-gateway' });
});

app.post(['/literature-note', '/ios-share/literature-note'], requireToken, async (req, res) => {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-ios-share-token': IOS_SHARE_TOKEN,
    };
    if (process.env.LOCAL_SERVER_TOKEN) {
      headers['x-local-server-token'] = process.env.LOCAL_SERVER_TOKEN;
    }

    const response = await fetch(`${LOCAL_API_BASE}/ios-share/literature-note`, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(Number(process.env.IOS_SHARE_GATEWAY_TIMEOUT_MS || 260000)),
    });
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (err) {
    console.error('[ios-share-gateway] failed:', err.message);
    res.status(502).json({ error: err.message || 'iOS share gateway failed' });
  }
});

app.post(['/debug-extract-url', '/ios-share/debug-extract-url'], requireToken, async (req, res) => {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-ios-share-token': IOS_SHARE_TOKEN,
    };
    if (process.env.LOCAL_SERVER_TOKEN) {
      headers['x-local-server-token'] = process.env.LOCAL_SERVER_TOKEN;
    }

    const response = await fetch(`${LOCAL_API_BASE}/ios-share/debug-extract-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(Number(process.env.IOS_SHARE_GATEWAY_TIMEOUT_MS || 260000)),
    });
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (err) {
    console.error('[ios-share-gateway] debug failed:', err.message);
    res.status(502).json({ error: err.message || 'iOS share debug failed' });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, HOST, () => {
  console.log(`iOS share gateway running on http://${HOST}:${PORT}`);
  console.log(`Forwarding literature notes to ${LOCAL_API_BASE}/ios-share/literature-note`);
});
