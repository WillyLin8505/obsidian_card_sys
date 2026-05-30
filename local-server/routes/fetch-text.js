import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { runAiCliText } from '../services/ai-cli.js';

const router = Router();
const MAX_TEXT_CHARS = 6000;

const DEFAULT_TEMPLATE_BODY = `## 來源資訊
- 作者：
- 標題：
- 連結：

## 重點摘要
`;

function buildSystemPrompt(sourceUrl, templateBody) {
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
從文章萃取作者、標題。連結固定填入：${sourceUrl || '（未提供）'}
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

// POST /fetch-text
// Body: { text: string, sourceUrl?: string, templateBody?: string }
// Accepts raw text content (e.g. copied from Threads, paywalled pages, any JS-rendered content)
// and returns the same { title, content } shape as /fetch-url.
router.post('/', async (req, res) => {
  const { text, sourceUrl, templateBody } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' });
  }
  if (text.trim().length < 20) {
    return res.status(422).json({ error: '文字內容太短，無法產生有意義的摘要' });
  }

  const truncated = text.trim().slice(0, MAX_TEXT_CHARS);
  const t0 = Date.now();
  const elapsed = (label) => console.log(`[fetch-text] ${label}: ${Date.now() - t0}ms`);

  const systemPrompt = buildSystemPrompt(sourceUrl || '', templateBody);
  const userMessage = `## 文章內容\n\n${truncated}`;
  const apiKey = process.env.CLAUDE_API_KEY;

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
      const { generatedTitle, content } = parseOutput(raw, sourceUrl || 'Threads 貼文');
      console.log(`[fetch-text] total: ${Date.now() - t0}ms | sdk | title: ${generatedTitle}`);
      return res.json({ title: generatedTitle, content, sourceUrl: sourceUrl || '' });
    } catch (err) {
      console.error('[fetch-text] SDK error:', err.message);
      return res.status(500).json({ error: `AI 分析失敗: ${err.message}` });
    }
  }

  elapsed('no API key — falling back to CLI');
  const cliPrompt = `${systemPrompt}\n\n${userMessage}`;
  try {
    const { text: raw, backend } = await runAiCliText(cliPrompt, {
      label: 'fetch-text',
      claudeModel: 'claude-haiku-4-5-20251001',
      timeoutMs: 90_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    elapsed('CLI done');
    const { generatedTitle, content } = parseOutput(raw, sourceUrl || 'Threads 貼文');
    console.log(`[fetch-text] total: ${Date.now() - t0}ms | ${backend} | title: ${generatedTitle}`);
    res.json({ title: generatedTitle, content, sourceUrl: sourceUrl || '' });
  } catch (err) {
    elapsed('CLI failed');
    console.error('[fetch-text] CLI error:', err.message);
    res.status(500).json({ error: `AI 分析失敗: ${err.message}` });
  }
});

export default router;
