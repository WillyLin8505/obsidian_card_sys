import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import healthRouter from './routes/health.js';
import searchRouter from './routes/search.js';
import notesRouter from './routes/notes.js';
import suggestTagsRouter from './routes/suggest-tags.js';
import generateLinkedNotesRouter from './routes/generate-linked-notes.js';
import expandQueryRouter from './routes/expand-query.js';
import enrichNoteRouter from './routes/enrich-note.js';
import fetchUrlRouter from './routes/fetch-url.js';
import enrichVaultRouter from './routes/enrich-vault.js';

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '127.0.0.1';
const LOCAL_SERVER_TOKEN = process.env.LOCAL_SERVER_TOKEN || '';
const hasVaultAllowlist = Boolean(process.env.OBSIDIAN_VAULT_PATHS || process.env.ALLOWED_VAULT_PATHS);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const __dirname = dirname(fileURLToPath(import.meta.url));

const localHosts = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);
const isPublicBind = !localHosts.has(HOST);
if (isPublicBind && !LOCAL_SERVER_TOKEN) {
  console.error('安全設定不足：HOST 不是本機位址時，必須設定 LOCAL_SERVER_TOKEN。');
  process.exit(1);
}
if (isPublicBind && !hasVaultAllowlist) {
  console.error('安全設定不足：HOST 不是本機位址時，必須設定 OBSIDIAN_VAULT_PATHS 或 ALLOWED_VAULT_PATHS。');
  process.exit(1);
}
// 0.0.0.0 in WSL2 is needed so Windows browsers can reach the server via localhost forwarding.
// Require vault allowlist as a substitute security layer when binding to all interfaces locally.
if (HOST === '0.0.0.0' && !hasVaultAllowlist) {
  console.error('安全設定不足：HOST=0.0.0.0 時必須設定 OBSIDIAN_VAULT_PATHS 限制可存取的 Vault。');
  process.exit(1);
}

// ── 自動啟動 Python search server ────────────────────────────────
const VENV_PYTHON = join(__dirname, '../llama-search/.venv-wsl/bin/python');
const SEARCH_SCRIPT = join(__dirname, '../llama-search/search_server.py');

let searchProc = null;

function startSearchServer() {
  searchProc = spawn(VENV_PYTHON, [SEARCH_SCRIPT], {
    cwd: join(__dirname, '../llama-search'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  searchProc.stdout.on('data', (d) => process.stdout.write(`[search-server] ${d}`));
  searchProc.stderr.on('data', (d) => process.stderr.write(`[search-server] ${d}`));

  searchProc.on('exit', (code, signal) => {
    if (signal !== 'SIGTERM' && signal !== 'SIGINT') {
      console.error(`[search-server] 意外退出 (code=${code})，3 秒後重啟...`);
      setTimeout(startSearchServer, 3000);
    }
  });

  console.log('[search-server] 啟動中（BGE-M3 模型載入約 25 秒）...');
}

startSearchServer();

// Node 結束時一起關掉 Python server
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    searchProc?.kill(sig);
    process.exit(0);
  });
}

const app = express();
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin not allowed: ${origin}`));
  },
}));
app.use(express.json({ limit: '1mb' }));

const rateLimitRules = [
  { prefix: '/fetch-url', windowMs: 60_000, max: 10 },
  { prefix: '/enrich-vault', windowMs: 10 * 60_000, max: 1 },
  { prefix: '/enrich-note', windowMs: 60_000, max: 5 },
  { prefix: '/notes/reload', windowMs: 60_000, max: 5 },
  { prefix: '/search', windowMs: 60_000, max: 60 },
  { prefix: '/notes/asset', windowMs: 60_000, max: 300 },
  { prefix: '/notes', windowMs: 60_000, max: 120 },
];
const rateBuckets = new Map();

function getClientKey(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

app.use((req, res, next) => {
  const rule = rateLimitRules.find(({ prefix }) => req.path.startsWith(prefix));
  if (!rule) return next();

  const now = Date.now();
  const key = `${getClientKey(req)}:${rule.prefix}`;
  let bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + rule.windowMs };
    rateBuckets.set(key, bucket);
  }

  if (bucket.count >= rule.max) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  bucket.count += 1;
  return next();
});

app.use((req, res, next) => {
  if (!LOCAL_SERVER_TOKEN) return next();
  const auth = req.get('authorization') || '';
  const token = req.get('x-local-server-token') || auth.replace(/^Bearer\s+/i, '') || req.query.token;
  if (token === LOCAL_SERVER_TOKEN) return next();
  return res.status(401).json({ error: 'Unauthorized local server request' });
});

app.use('/health', healthRouter);
app.use('/search', searchRouter);
app.use('/notes', notesRouter);
app.use('/suggest-tags', suggestTagsRouter);
app.use('/generate-linked-notes', generateLinkedNotesRouter);
app.use('/expand-query', expandQueryRouter);
app.use('/enrich-note', enrichNoteRouter);
app.use('/fetch-url', fetchUrlRouter);
app.use('/enrich-vault', enrichVaultRouter);

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Card Box local server running on http://${HOST}:${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
  console.log(`Local token auth: ${LOCAL_SERVER_TOKEN ? 'enabled' : 'disabled'}`);
  console.log(`Health check: http://${HOST}:${PORT}/health`);
  console.log(`Search:       POST http://${HOST}:${PORT}/search`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Close the other terminal running this server, or find the PID:\n` +
        `  netstat -ano | findstr :${PORT}\n` +
        `Or use another port (update app Config → backend URL to match):\n` +
        `  $env:PORT=3002; npm run dev`
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});
