import { Router } from 'express';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join, relative } from 'path';
import { randomUUID } from 'crypto';
import { assertAllowedVault, isWithinPath, resolveUserPath } from '../security.js';
import { buildSourceNoteFrontmatter, loadSourceNoteTemplate } from '../services/source-note-template.js';

const router = Router();

function firstConfiguredVault() {
  const raw = process.env.IOS_SHARE_VAULT_PATH ||
    (process.env.OBSIDIAN_VAULT_PATHS || process.env.ALLOWED_VAULT_PATHS || '').split(',')[0];
  return resolveUserPath(raw || '');
}

function safeFilename(title) {
  const base = String(title || '文獻筆記')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || '文獻筆記';
  return `${base}.md`;
}

function requireIosShareToken(req, res) {
  const expected = process.env.IOS_SHARE_TOKEN || '';
  if (!expected) return true;
  const auth = req.get('authorization') || '';
  const token = req.get('x-ios-share-token') || auth.replace(/^Bearer\s+/i, '') || req.query.token;
  if (token === expected) return true;
  res.status(401).json({ error: 'Unauthorized iOS share request' });
  return false;
}

function valueToText(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(valueToText).filter(Boolean).join('\n');
  if (value && typeof value === 'object') {
    const preferred = ['url', 'URL', 'link', 'href', 'text', 'title', 'name']
      .map(key => valueToText(value[key]))
      .filter(Boolean)
      .join('\n');
    const allValues = Object.values(value)
      .map(valueToText)
      .filter(Boolean)
      .join('\n');
    return [preferred, allValues].filter(Boolean).join('\n') || JSON.stringify(value);
  }
  return '';
}

function extractUrlCandidates(...values) {
  const text = values.map(valueToText).filter(Boolean).join('\n').trim();
  if (!text) return [];

  try {
    return [new URL(text).toString()];
  } catch {
    // Continue and extract a URL embedded in shared text.
  }

  const matches = text.match(/https?:\/\/[^\s<>"'，。、《》「」]+/gi) || [];
  return [...new Set(matches.map(match => match.replace(/[)\].,，。！？!?]+$/, '')))];
}

function extractFirstUrl(...values) {
  return extractUrlCandidates(...values)[0] || '';
}

function internalApiHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.LOCAL_SERVER_TOKEN) {
    headers['x-local-server-token'] = process.env.LOCAL_SERVER_TOKEN;
  }
  return headers;
}

function internalBaseUrl() {
  return (process.env.IOS_SHARE_INTERNAL_API_URL || `http://127.0.0.1:${process.env.PORT || 3001}`).replace(/\/$/, '');
}

async function analyzeUrl(url, templateBody) {
  const response = await fetch(`${internalBaseUrl()}/fetch-url`, {
    method: 'POST',
    headers: internalApiHeaders(),
    body: JSON.stringify({
      url,
      templateBody,
    }),
    signal: AbortSignal.timeout(Number(process.env.IOS_SHARE_ANALYZE_TIMEOUT_MS || 240000)),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `URL analysis failed (${response.status})`);
  }
  return data;
}

async function analyzeText(text, sourceUrl, templateBody) {
  const response = await fetch(`${internalBaseUrl()}/fetch-text`, {
    method: 'POST',
    headers: internalApiHeaders(),
    body: JSON.stringify({
      text,
      sourceUrl: sourceUrl || '',
      templateBody,
    }),
    signal: AbortSignal.timeout(Number(process.env.IOS_SHARE_ANALYZE_TIMEOUT_MS || 60000)),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Text analysis failed (${response.status})`);
  }
  return data;
}

async function saveLiteratureNote({ title, content, sourceUrl, template }) {
  const vaultPath = await assertAllowedVault(firstConfiguredVault());
  const dirFromEnv = process.env.IOS_SHARE_SOURCE_NOTE_DIR || 'Sources/inbox';
  const relativeDir = dirFromEnv.replace(/^[/\\]+/, '').replace(/\\/g, '/');
  const targetDir = join(vaultPath, relativeDir);
  const filename = safeFilename(title);
  const filePath = join(targetDir, filename);

  if (!await isWithinPath(vaultPath, filePath)) {
    const err = new Error('iOS share save path is outside the configured vault');
    err.status = 403;
    throw err;
  }

  const noteContent = `${buildSourceNoteFrontmatter(template, { sourceUrl, title })}${String(content || '').trim()}\n`;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, noteContent, 'utf-8');
  return relative(vaultPath, filePath).replace(/\\/g, '/');
}

// POST /ios-share/literature-note
// URL mode:  { url: string, title?: string }
// Text mode: { content: string, url?: string, title?: string }
//   — use when the page requires login (e.g. Threads) or is a JS-rendered SPA.
//     Pass the copied/scraped post text in `content` and optionally the post URL in `url`.
router.post('/literature-note', async (req, res) => {
  if (!requireIosShareToken(req, res)) return;

  const id = randomUUID();
  const rawContent = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  const isTextMode = rawContent.length >= 20;

  try {
    const { template } = await loadSourceNoteTemplate();
    const templateBody = process.env.IOS_SHARE_TEMPLATE_BODY || template.bodyTemplate;
    let analyzed, title, sourceUrl;

    if (isTextMode) {
      const hintUrl = extractFirstUrl(req.body?.url, req.body?.text, req.body?.input) || '';
      analyzed = await analyzeText(rawContent, hintUrl, templateBody);
      title = analyzed.title || req.body.title || 'Threads 貼文';
      sourceUrl = analyzed.sourceUrl || hintUrl;
    } else {
      const rawUrl = extractFirstUrl(req.body?.url, req.body?.text, req.body?.input, req.body);
      if (!rawUrl) {
        return res.status(400).json({
          error: 'url 或 content 必須提供其中一個。' +
            '傳入純文字請用 content 欄位；傳入網址請用 url 欄位。',
        });
      }
      let parsedUrl;
      try {
        parsedUrl = new URL(rawUrl);
      } catch {
        return res.status(400).json({ error: '無效的網址格式' });
      }
      analyzed = await analyzeUrl(parsedUrl.toString(), templateBody);
      title = analyzed.title || req.body.title || parsedUrl.hostname;
      sourceUrl = analyzed.sourceUrl || parsedUrl.toString();
    }

    const relativePath = await saveLiteratureNote({ title, content: analyzed.content, sourceUrl, template });
    res.json({
      ok: true,
      id,
      title,
      sourceUrl,
      relativePath,
      notebookUrl: analyzed.notebookUrl,
      via: analyzed.via || (isTextMode ? 'fetch-text' : 'fetch-url'),
    });
  } catch (err) {
    console.error('[ios-share] failed:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'iOS share failed' });
  }
});

// POST /ios-share/debug-extract-url
// Same auth/body as /literature-note, but only reports URL extraction result.
router.post('/debug-extract-url', async (req, res) => {
  if (!requireIosShareToken(req, res)) return;

  const candidates = extractUrlCandidates(req.body?.url, req.body?.text, req.body?.input, req.body);
  res.json({
    ok: true,
    extractedUrl: candidates[0] || null,
    candidates,
    bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : [],
    received: req.body ?? null,
  });
});

export default router;
