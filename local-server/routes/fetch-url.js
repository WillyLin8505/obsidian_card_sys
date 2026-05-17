import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import dns from 'dns/promises';
import net from 'net';
import { runAiCliText } from '../services/ai-cli.js';

const router = Router();
const MAX_TEXT_CHARS = 6000;

const DEFAULT_TEMPLATE_BODY = `## 來源資訊
- 作者：
- 標題：
- 連結：

## 重點摘要
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

## 各區段填寫方式

**來源資訊（或同義區段）**
從文章萃取作者、標題。連結固定填入：${url}
找不到的欄位留空。

**重點摘要（或同義區段）**
條列 3–5 個核心觀點，每點一行，格式：**[觀點名稱]**：一句話說明底層原則。
整個區段總字數不超過 300 字（中文字元計算），不加範例、不加說明段落。

## 模板

${template}`;
}

function parseOutput(raw, fallbackTitle) {
  const titleMatch = raw.match(/^TITLE:\s*(.+)/);
  const generatedTitle = titleMatch ? titleMatch[1].trim() : fallbackTitle;
  const content = titleMatch ? raw.replace(/^TITLE:\s*.+\n?\n?/, '').trim() : raw;
  return { generatedTitle, content };
}

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
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

  // Fetch the page — try direct first, fall back to Jina Reader on bot-block
  let text;
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
      text = extractText(html);
      elapsed(`text extracted (${text.length} chars)`);
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

  if (!text || text.length < 100) {
    return res.status(422).json({ error: '無法從該網頁擷取足夠的文字內容（可能需要登入或是動態頁面）' });
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
      return res.json({ title: generatedTitle, content });
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
    res.json({ title: generatedTitle, content });
  } catch (err) {
    elapsed('CLI failed');
    console.error('[fetch-url] CLI error:', err.message);
    res.status(500).json({ error: `AI 分析失敗: ${err.message}` });
  }
});

export default router;
