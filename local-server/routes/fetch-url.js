import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import dns from 'dns/promises';
import net from 'net';
import { runAiCliText } from '../services/ai-cli.js';

const router = Router();
const MAX_TEXT_CHARS = 6000;
const DEFAULT_NOTEBOOKLM_API_URL = 'http://127.0.0.1:3000';

const DEFAULT_TEMPLATE_BODY = `## 來源資訊
- 作者：
- 標題：
- 連結：

## 重點摘要

## 文章內容
`;

function buildSystemPrompt(url, templateBody) {
  const template = (templateBody || DEFAULT_TEMPLATE_BODY).trim();
  return `你是一位高效的資訊架構師。請用第一性原理（First Principles）分析以下文章，並填入指定模板。全程輸出繁體中文。

## 分析規則（內部思考，不輸出過程）

1. 識別文章中所有假設、行業慣例或「常識」。
2. 對每個假設連問「為什麼」，直到抵達不可辯駁的絕對事實（自然科學或數學）。
3. 拋棄原文範例，純用絕對事實重建核心洞見。

## 輸出格式

第一行必須是筆記標題，格式如下（不加任何前綴或符號）：
TITLE: [10字以內的繁體中文標題，反映文章核心主題]

空一行後，填入模板內容。

## 輸出限制

- 無表情符號。無開場白、結語或模板區段以外的任何額外內容。
- 只填入以下模板的各區段，不增加、不改名、不調整區段順序。
- 使用 Markdown：**加粗關鍵術語**，用 \`---\` 分隔各節。
- **絕對禁止**：不得要求更多資訊、不得說內容不足、不得拒絕輸出。無論文章內容多短，都必須直接填入模板並輸出結果。

## 各區段填寫方式

**來源資訊（或同義區段）**
從文章萃取作者、標題。連結固定填入：${url}
找不到的欄位留空。

**重點摘要（或同義區段）**
條列 3–5 個核心觀點，每點一行，格式：**[觀點名稱]**：一句話說明底層原則。
整個區段總字數不超過 300 字（中文字元計算），不加範例、不加說明段落。

**文章內容**
保留空白。系統會在分析完成後寫入未經修改的網頁原文。

## 模板

${template}`;
}

function parseOutput(raw, fallbackTitle) {
  const titleMatch = raw.match(/^TITLE:\s*(.+)/);
  const generatedTitle = titleMatch ? titleMatch[1].trim() : fallbackTitle;
  const content = titleMatch ? raw.replace(/^TITLE:\s*.+\n?\n?/, '').trim() : raw;
  return { generatedTitle, content };
}

function withOriginalArticleContent(content, originalText) {
  const original = String(originalText || '').trim();
  const markdown = String(content || '').trim();
  const heading = /^##\s+文章內容\s*$/m;
  const match = heading.exec(markdown);

  if (!match) {
    return [markdown, '---', '## 文章內容', original].filter(Boolean).join('\n\n');
  }

  const bodyStart = match.index + match[0].length;
  const nextHeading = markdown.slice(bodyStart).search(/\n##\s+/);
  const bodyEnd = nextHeading === -1 ? markdown.length : bodyStart + nextHeading;
  return `${markdown.slice(0, bodyStart).trimEnd()}\n\n${original}${markdown.slice(bodyEnd)}`.trim();
}

function isYoutubeHost(hostname) {
  const host = hostname.toLowerCase();
  return host === 'youtu.be' || host.endsWith('.youtube.com') || host === 'youtube.com';
}

function isThreadsHost(hostname) {
  const host = hostname.toLowerCase();
  return host === 'threads.net' || host.endsWith('.threads.net') ||
    host === 'threads.com' || host.endsWith('.threads.com');
}

function extractThreadsAuthor(parsedUrl) {
  const parts = parsedUrl.pathname.split('/').filter(Boolean);
  const userPart = parts.find(p => p.startsWith('@'));
  return userPart || '';
}

function buildThreadsNoteContent(text, author, url) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  // Try to find the title from the first non-header meaningful line
  const firstMeaningful = lines
    .map(l => l.replace(/^#+\s*/, '').trim())
    .find(l => l.length > 5 && !l.startsWith('http'));
  const title = firstMeaningful
    ? firstMeaningful.slice(0, 60)
    : (author ? `${author} 的 Threads 貼文` : 'Threads 貼文');

  const content = [
    `## 來源資訊`,
    `- 作者：${author || ''}`,
    `- 連結：${url}`,
    ``,
    `---`,
    ``,
    `## 文章內容`,
    ``,
    text.trim(),
  ].join('\n');

  return { title, content };
}

function extractYoutubeVideoId(parsedUrl) {
  if (parsedUrl.hostname.toLowerCase() === 'youtu.be') {
    return parsedUrl.pathname.split('/').filter(Boolean)[0] || '';
  }

  if (parsedUrl.searchParams.get('v')) return parsedUrl.searchParams.get('v');

  const parts = parsedUrl.pathname.split('/').filter(Boolean);
  const knownVideoPrefixes = new Set(['shorts', 'live', 'embed']);
  if (knownVideoPrefixes.has(parts[0])) return parts[1] || '';
  return '';
}

function normalizeYoutubeVideoUrl(parsedUrl) {
  const videoId = extractYoutubeVideoId(parsedUrl);
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : parsedUrl.toString();
}

async function fetchYoutubeTitle(videoUrl) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`, {
      headers: { 'User-Agent': 'CardBoxNoteManagement/1.0' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return '';
    const data = await res.json().catch(() => ({}));
    return data.title || '';
  } catch {
    return '';
  }
}

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/$/, '');
}

function normalizeNotebookUrl(url) {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.delete('addSource');
    return parsedUrl.toString();
  } catch {
    return url;
  }
}

async function postNotebookLm(path, body) {
  const baseUrl = normalizeBaseUrl(process.env.NOTEBOOKLM_API_URL || DEFAULT_NOTEBOOKLM_API_URL);
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `NotebookLM ${path} failed (HTTP ${res.status})`);
  }
  return data;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function notebookNameForVideo(videoTitle) {
  const base = (videoTitle || 'YouTube 影片摘要')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `影片摘要 - ${base}`;
}

function emitYoutubeProgress(onProgress, progress, stage, label) {
  onProgress?.({ progress, stage, label });
}

async function createNotebookForYoutube(videoTitle, elapsed, onProgress) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      emitYoutubeProgress(
        onProgress,
        attempt > 0 ? 30 : 24,
        'notebook',
        attempt > 0 ? '重新建立 NotebookLM 筆記本' : '建立 NotebookLM 筆記本'
      );
      const result = await postNotebookLm('/notebooks/create', {
        name: notebookNameForVideo(videoTitle),
      });
      const notebookUrl = result.data?.notebook_url || result.notebook_url;
      if (!notebookUrl) {
        throw new Error('NotebookLM 建立新 notebook 後沒有回傳 notebook_url');
      }
      elapsed(`NotebookLM notebook created${attempt > 0 ? ` after retry ${attempt}` : ''}`);
      emitYoutubeProgress(onProgress, 40, 'notebook', 'NotebookLM 筆記本已建立');
      return normalizeNotebookUrl(notebookUrl);
    } catch (err) {
      lastError = err;
      console.warn(`[fetch-url] NotebookLM create notebook retry ${attempt + 1}: ${err.message}`);
      if (attempt === 0) await sleep(5000);
    }
  }
  throw lastError;
}

function buildYoutubePrompt(videoTitle, videoUrl, templateBody) {
  const template = (templateBody || DEFAULT_TEMPLATE_BODY).trim();
  return [
    '請用繁體中文整理這支 YouTube 影片，並把結果填入文獻筆記模板。',
    '',
    '第一行請輸出筆記標題，格式：',
    'TITLE: [10字以內的繁體中文標題，反映影片核心主題]',
    '',
    '接著只輸出模板內容，不要開場白、不要結語。',
    '',
    '模板填寫規則：',
    `- 來源資訊中的標題填入：${videoTitle || '影片標題'}`,
    `- 來源資訊中的連結填入：${videoUrl}`,
    '- 重點摘要請整理 3-5 個核心觀點。',
    '- 若模板中有心得、摘錄、問題、行動項目，請根據影片內容填寫。',
    '',
    '影片資訊：',
    `標題：${videoTitle || '未知'}`,
    `連結：${videoUrl}`,
    '',
    '模板：',
    template,
  ].join('\n');
}

async function askNotebookLmWithRetry(body, elapsed, onProgress) {
  const waits = [0, 8000, 15000];
  let lastError;

  for (let i = 0; i < waits.length; i++) {
    if (waits[i] > 0) await sleep(waits[i]);
    try {
      emitYoutubeProgress(
        onProgress,
        i === 0 ? 72 : 78 + (i * 4),
        'summary',
        i === 0 ? '請 NotebookLM 產生摘要' : '等待 NotebookLM 讀取來源後重試摘要'
      );
      const answer = await postNotebookLm('/ask', body);
      elapsed(`NotebookLM answer done${i > 0 ? ` after retry ${i}` : ''}`);
      emitYoutubeProgress(onProgress, 94, 'summary', 'NotebookLM 摘要已完成');
      return answer;
    } catch (err) {
      lastError = err;
      const message = err.message || '';
      if (!/source|summary|摘要|read|讀取|loading|process|處理/i.test(message) || i === waits.length - 1) {
        throw err;
      }
      console.warn(`[fetch-url] NotebookLM ask retry ${i + 1}: ${message}`);
    }
  }

  throw lastError;
}

async function summarizeYoutubeWithNotebookLm(parsedUrl, templateBody, elapsed, onProgress) {
  const videoUrl = normalizeYoutubeVideoUrl(parsedUrl);
  emitYoutubeProgress(onProgress, 8, 'video', '讀取 YouTube 影片資訊');
  const videoTitle = await fetchYoutubeTitle(videoUrl);
  elapsed('YouTube title resolved');
  emitYoutubeProgress(onProgress, 18, 'video', videoTitle ? '影片資訊已讀取' : '影片資訊已準備');

  const notebookUrl = await createNotebookForYoutube(videoTitle, elapsed, onProgress);
  const common = { notebook_url: notebookUrl };

  emitYoutubeProgress(onProgress, 48, 'source', '將影片加入 NotebookLM 來源');
  await postNotebookLm('/content/sources', {
    source_type: 'youtube',
    url: videoUrl,
    title: videoTitle || videoUrl,
    ...common,
  });
  elapsed('NotebookLM source added');
  emitYoutubeProgress(onProgress, 68, 'source', 'NotebookLM 已讀取影片來源');

  const answer = await askNotebookLmWithRetry({
    question: buildYoutubePrompt(videoTitle, videoUrl, templateBody),
    source_format: 'none',
    ...common,
  }, elapsed, onProgress);

  const raw = answer.data?.answer || answer.answer || JSON.stringify(answer.data || answer, null, 2);
  const { generatedTitle, content } = parseOutput(raw.trim(), videoTitle || 'YouTube 影片');
  emitYoutubeProgress(onProgress, 97, 'note', '整理文獻筆記內容');
  return {
    title: generatedTitle,
    content,
    sourceUrl: videoUrl,
    notebookUrl,
    via: 'notebooklm',
  };
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

function extractMetaContent(html, key, value) {
  const tags = String(html || '').match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const keyMatch = tag.match(new RegExp(`\\b${key}\\s*=\\s*["']([^"']+)["']`, 'i'));
    if (keyMatch?.[1].toLowerCase() !== value.toLowerCase()) continue;
    const contentMatch = tag.match(/\bcontent\s*=\s*["']([\s\S]*?)["']/i);
    if (contentMatch) return decodeHtmlEntities(contentMatch[1]).trim();
  }
  return '';
}

function extractThreadsPostText(html) {
  return extractMetaContent(html, 'property', 'og:description') ||
    extractMetaContent(html, 'name', 'description');
}

async function fetchThreadsPostText(parsedUrl, elapsed) {
  const res = await fetch(parsedUrl.toString(), {
    headers: {
      'User-Agent': 'CardBoxNoteManagement/1.0',
      'Accept': 'text/html',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  elapsed('Threads metadata fetch done');
  if (!res.ok) throw new Error(`Threads metadata 失敗 (HTTP ${res.status})`);
  const postText = extractThreadsPostText(await res.text());
  if (!postText) throw new Error('Threads metadata 沒有主貼文內容');
  return postText.slice(0, MAX_TEXT_CHARS);
}

function extractText(html) {
  return decodeHtmlEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

function isPrivateIp(address) {
  if (net.isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    );
  }
  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  }
  return false;
}

async function assertPublicHttpUrl(parsedUrl) {
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    const err = new Error('只允許 http/https 網址');
    err.status = 400;
    throw err;
  }
  if (!parsedUrl.hostname || ['localhost', 'localhost.localdomain'].includes(parsedUrl.hostname.toLowerCase())) {
    const err = new Error('不允許抓取 localhost 或內網位址');
    err.status = 400;
    throw err;
  }

  const records = await dns.lookup(parsedUrl.hostname, { all: true, verbatim: true });
  if (records.some(record => isPrivateIp(record.address))) {
    const err = new Error('不允許抓取內網、loopback 或 link-local 位址');
    err.status = 400;
    throw err;
  }
}

async function fetchViaJina(url, elapsed) {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(jinaUrl, {
    headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
    signal: AbortSignal.timeout(20000),
  });
  elapsed('Jina fetch done');
  if (!res.ok) throw new Error(`Jina Reader 失敗 (HTTP ${res.status})`);
  const raw = await res.text();
  // Jina returns markdown — truncate to MAX_TEXT_CHARS
  return raw.slice(0, MAX_TEXT_CHARS);
}

function writeStreamMessage(res, message) {
  if (!res.writableEnded) {
    res.write(`${JSON.stringify(message)}\n`);
  }
}

async function parsePublicUrlRequest(req, res) {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url is required' });
    return null;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    res.status(400).json({ error: '無效的網址格式' });
    return null;
  }

  try {
    await assertPublicHttpUrl(parsedUrl);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
    return null;
  }

  return parsedUrl;
}

// POST /fetch-url/stream
// Body: { url: string, templateBody?: string }
// NDJSON events: { type: "progress", progress }, { type: "result", result }, { type: "error", error }
router.post('/stream', async (req, res) => {
  const { templateBody } = req.body;
  const parsedUrl = await parsePublicUrlRequest(req, res);
  if (!parsedUrl) return;

  if (!isYoutubeHost(parsedUrl.hostname)) {
    return res.status(422).json({ error: '串流進度目前只支援 YouTube 影片' });
  }

  res.status(200);
  res.set({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const t0 = Date.now();
  const elapsed = (label) => console.log(`[fetch-url] ${label}: ${Date.now() - t0}ms`);
  const sendProgress = (progress) => writeStreamMessage(res, { type: 'progress', progress });

  sendProgress({ progress: 2, stage: 'start', label: '開始處理影片連結' });
  try {
    const result = await summarizeYoutubeWithNotebookLm(parsedUrl, templateBody, elapsed, sendProgress);
    console.log(`[fetch-url] total: ${Date.now() - t0}ms | notebooklm stream | title: ${result.title}`);
    sendProgress({ progress: 100, stage: 'done', label: '影片摘要已完成' });
    writeStreamMessage(res, { type: 'result', result });
  } catch (err) {
    console.error('[fetch-url] NotebookLM YouTube stream error:', err.message);
    writeStreamMessage(res, {
      type: 'error',
      error: `NotebookLM 摘要失敗: ${err.message}。請確認 NotebookLM MCP/REST API 已啟動，並已登入 Google。`,
    });
  } finally {
    res.end();
  }
});

// POST /fetch-url
// Body: { url: string, templateBody?: string }
router.post('/', async (req, res) => {
  const { url, templateBody } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: '無效的網址格式' });
  }
  try {
    await assertPublicHttpUrl(parsedUrl);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const t0 = Date.now();
  const elapsed = (label) => console.log(`[fetch-url] ${label}: ${Date.now() - t0}ms`);

  if (isYoutubeHost(parsedUrl.hostname)) {
    try {
      const result = await summarizeYoutubeWithNotebookLm(parsedUrl, templateBody, elapsed);
      console.log(`[fetch-url] total: ${Date.now() - t0}ms | notebooklm | title: ${result.title}`);
      return res.json(result);
    } catch (err) {
      console.error('[fetch-url] NotebookLM YouTube error:', err.message);
      return res.status(502).json({
        error: `NotebookLM 摘要失敗: ${err.message}。請確認 NotebookLM MCP/REST API 已啟動，並已登入 Google。`,
      });
    }
  }

  // Fetch the page — try direct first, fall back to Jina Reader on bot-block
  let text;
  if (isThreadsHost(parsedUrl.hostname)) {
    try {
      text = await fetchThreadsPostText(parsedUrl, elapsed);
    } catch (err) {
      console.warn(`[fetch-url] Threads metadata fallback: ${err.message}`);
    }
  }

  if (!text) {
  try {
    const directRes = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    elapsed('HTML fetch done');

    if (directRes.ok) {
      const html = await directRes.text();
      text = isThreadsHost(parsedUrl.hostname)
        ? extractThreadsPostText(html) || extractText(html)
        : extractText(html);
      elapsed(`text extracted (${text.length} chars)`);
      // JS-rendered SPAs (e.g. Threads) return 200 but hide content in <script> tags.
      // extractText strips scripts, leaving near-empty output — fall back to Jina Reader.
      if (text.length < 100) {
        console.log(`[fetch-url] extracted text too short (${text.length} chars), trying Jina Reader`);
        try {
          text = await fetchViaJina(parsedUrl.toString(), elapsed);
        } catch (jinaErr) {
          console.warn(`[fetch-url] Jina fallback failed: ${jinaErr.message}`);
        }
      }
    } else if (directRes.status === 404) {
      return res.status(502).json({ error: '無法存取網頁 (HTTP 404)（網址不存在，請確認是否正確）' });
    } else {
      // Bot-blocked or other error — try Jina Reader
      console.log(`[fetch-url] direct fetch ${directRes.status}, trying Jina Reader`);
      text = await fetchViaJina(parsedUrl.toString(), elapsed);
    }
  } catch (err) {
    const detail = err.cause?.message || err.message;
    if (detail.includes('ENOTFOUND')) {
      return res.status(502).json({ error: `抓取網頁失敗: ${detail}（DNS 無法解析此域名，請確認網址是否正確）` });
    }
    if (detail.includes('ECONNREFUSED')) {
      return res.status(502).json({ error: `抓取網頁失敗: ${detail}（無法連線至目標伺服器）` });
    }
    // Network error — also try Jina
    console.log(`[fetch-url] direct fetch error (${detail}), trying Jina Reader`);
    try {
      text = await fetchViaJina(parsedUrl.toString(), elapsed);
    } catch (jinaErr) {
      return res.status(502).json({ error: `抓取網頁失敗: ${detail}` });
    }
  }
  }

  if (!text || text.length < 100) {
    return res.status(422).json({ error: '無法從該網頁擷取足夠的文字內容（可能需要登入或是動態頁面）' });
  }

  // Threads: embed raw post content directly — no AI summarization needed
  if (isThreadsHost(parsedUrl.hostname)) {
    const author = extractThreadsAuthor(parsedUrl);
    const { title, content } = buildThreadsNoteContent(text, author, parsedUrl.toString());
    console.log(`[fetch-url] total: ${Date.now() - t0}ms | threads-embed | title: ${title}`);
    return res.json({ title, content, sourceUrl: parsedUrl.toString() });
  }

  const systemPrompt = buildSystemPrompt(parsedUrl.toString(), templateBody);
  const userMessage = `## 文章內容\n\n${text}`;
  const apiKey = process.env.CLAUDE_API_KEY;

  // Fast path: Anthropic SDK (no process startup overhead, ~3–6s)
  if (apiKey) {
    elapsed('using SDK path');
    try {
      const client = new Anthropic({ apiKey });
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });
      elapsed('SDK done');
      const raw = message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';
      const { generatedTitle, content } = parseOutput(raw, parsedUrl.hostname);
      console.log(`[fetch-url] total: ${Date.now() - t0}ms | sdk | title: ${generatedTitle}`);
      return res.json({ title: generatedTitle, content: withOriginalArticleContent(content, text) });
    } catch (err) {
      console.error('[fetch-url] SDK error:', err.message);
      return res.status(500).json({ error: `AI 分析失敗: ${err.message}` });
    }
  }

  // Slow path: CLI fallback (extra startup overhead)
  elapsed('no API key — falling back to CLI');
  const cliPrompt = `${systemPrompt}\n\n${userMessage}`;

  try {
    const { text: raw, backend } = await runAiCliText(cliPrompt, {
      label: 'fetch-url',
      claudeModel: 'claude-haiku-4-5-20251001',
      timeoutMs: 90_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    elapsed('CLI done');
    const { generatedTitle, content } = parseOutput(raw, parsedUrl.hostname);
    console.log(`[fetch-url] total: ${Date.now() - t0}ms | ${backend} | title: ${generatedTitle}`);
    res.json({ title: generatedTitle, content: withOriginalArticleContent(content, text) });
  } catch (err) {
    elapsed('CLI failed');
    console.error('[fetch-url] CLI error:', err.message);
    res.status(500).json({ error: `AI 分析失敗: ${err.message}` });
  }
});

export default router;
