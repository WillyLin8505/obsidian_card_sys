import 'dotenv/config';
import express from 'express';
import { Readable } from 'stream';

const PORT = Number(process.env.APP_GATEWAY_PORT || 3020);
const HOST = process.env.APP_GATEWAY_HOST || '127.0.0.1';
const FRONTEND_ORIGIN = (process.env.APP_GATEWAY_FRONTEND_ORIGIN || 'http://127.0.0.1:5173').replace(/\/$/, '');
const LOCAL_API_BASE = (process.env.APP_GATEWAY_INTERNAL_API_URL || `http://127.0.0.1:${process.env.PORT || 3001}`).replace(/\/$/, '');
const APP_GATEWAY_TOKEN = process.env.APP_GATEWAY_TOKEN || '';
const LOCAL_SERVER_TOKEN = process.env.LOCAL_SERVER_TOKEN || '';
const COOKIE_NAME = 'card_box_gateway';

if (!APP_GATEWAY_TOKEN) {
  console.error('安全設定不足：請在 local-server/.env 設定 APP_GATEWAY_TOKEN 後再啟動 App Gateway。');
  process.exit(1);
}

const app = express();

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const index = part.indexOf('=');
        if (index < 0) return [part, ''];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function isHttpsRequest(req) {
  return req.secure || req.get('x-forwarded-proto') === 'https' || process.env.APP_GATEWAY_COOKIE_SECURE === 'true';
}

function setGatewayCookie(req, res) {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(APP_GATEWAY_TOKEN)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`
  );
}

function stripTokenFromUrl(req) {
  const url = new URL(`${req.protocol}://${req.get('host')}${req.originalUrl}`);
  url.searchParams.delete('token');
  return `${url.pathname}${url.search}`;
}

function isAuthorized(req) {
  const auth = req.get('authorization') || '';
  const bearerToken = auth.replace(/^Bearer\s+/i, '');
  const queryToken = req.query.token;
  const cookies = parseCookies(req.get('cookie') || '');
  return queryToken === APP_GATEWAY_TOKEN || bearerToken === APP_GATEWAY_TOKEN || cookies[COOKIE_NAME] === APP_GATEWAY_TOKEN;
}

function requireGatewayAuth(req, res, next) {
  if (req.query.token === APP_GATEWAY_TOKEN) {
    setGatewayCookie(req, res);
    if (req.method === 'GET') return res.redirect(302, stripTokenFromUrl(req));
    return next();
  }
  if (isAuthorized(req)) return next();
  return res.status(401).type('html').send(`<!doctype html>
<html lang="zh-Hant">
  <head><meta charset="utf-8"><title>需要登入</title></head>
  <body>
    <h1>需要 App Gateway Token</h1>
    <p>請用包含 token 的網址開啟一次，格式：</p>
    <pre>https://你的-cloudflare-url/?token=APP_GATEWAY_TOKEN</pre>
  </body>
</html>`);
}

function copyResponseHeaders(source, res) {
  source.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (['connection', 'content-encoding', 'content-length', 'keep-alive', 'transfer-encoding'].includes(lower)) return;
    res.setHeader(key, value);
  });
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

async function proxyFetch(req, res, targetBase, stripPrefix = '') {
  const targetPath = stripPrefix && req.originalUrl.startsWith(stripPrefix)
    ? req.originalUrl.slice(stripPrefix.length) || '/'
    : req.originalUrl;
  const targetUrl = `${targetBase}${targetPath}`;
  const headers = { ...req.headers };
  delete headers.host;
  delete headers['content-length'];
  delete headers.cookie;
  delete headers.authorization;
  if (targetBase === LOCAL_API_BASE && LOCAL_SERVER_TOKEN) {
    headers['x-local-server-token'] = LOCAL_SERVER_TOKEN;
  }

  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
    redirect: 'manual',
    signal: AbortSignal.timeout(Number(process.env.APP_GATEWAY_TIMEOUT_MS || 300000)),
  });

  res.status(response.status);
  copyResponseHeaders(response, res);
  if (!response.body) return res.end();
  return Readable.fromWeb(response.body).pipe(res);
}

app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

app.get('/gateway-health', (_req, res) => {
  res.json({
    ok: true,
    service: 'card-box-app-gateway',
    frontend: FRONTEND_ORIGIN,
    api: LOCAL_API_BASE,
    auth: true,
  });
});

app.use(requireGatewayAuth);

app.use('/api', express.raw({ type: '*/*', limit: process.env.APP_GATEWAY_BODY_LIMIT || '50mb' }));
app.all('/api/*', (req, res) => {
  proxyFetch(req, res, LOCAL_API_BASE, '/api').catch(err => {
    console.error('[app-gateway] api proxy failed:', err.message);
    res.status(502).json({ error: err.message || 'App Gateway API proxy failed' });
  });
});

app.all('*', (req, res) => {
  proxyFetch(req, res, FRONTEND_ORIGIN).catch(err => {
    console.error('[app-gateway] frontend proxy failed:', err.message);
    res.status(502).send(err.message || 'App Gateway frontend proxy failed');
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Card Box App Gateway running on http://${HOST}:${PORT}`);
  console.log(`Frontend origin: ${FRONTEND_ORIGIN}`);
  console.log(`Internal API:     ${LOCAL_API_BASE}`);
  console.log('Tunnel only this gateway. Do not tunnel NotebookLM MCP :3000 directly.');
});
