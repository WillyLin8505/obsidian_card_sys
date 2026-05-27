import { Router } from 'express';
import { writeFile, mkdir, access, appendFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { runAiCliText } from '../services/ai-cli.js';
import { assertAllowedVault } from '../security.js';

const router = Router();
const SEARCH_SERVER_URL = process.env.SEARCH_SERVER_URL || 'http://127.0.0.1:8765';
const LOG_PAGES = {
  'all-files': '所有檔案',
  'permanent-notes': '連結筆記',
  'source-notes': '文獻筆記',
};

async function searchNotes(query, topK = 6) {
  const res = await fetch(`${SEARCH_SERVER_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: query, top_k: topK }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`search-server ${res.status}`);
  return res.json();
}

function buildContext(chunks, maxChars = 5000) {
  let ctx = '';
  for (const c of chunks) {
    const block = `【${c.notePath}】\n${c.content}\n\n`;
    if ((ctx + block).length > maxChars) break;
    ctx += block;
  }
  return ctx.trim();
}

function expandPath(p) {
  return p?.startsWith('~') ? p.replace('~', homedir()) : p;
}

function localDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

function normalizeLogContext(context) {
  const key = typeof context?.pageKey === 'string' ? context.pageKey : 'all-files';
  const pageKey = Object.prototype.hasOwnProperty.call(LOG_PAGES, key) ? key : 'all-files';
  return {
    pageKey,
    pageLabel: LOG_PAGES[pageKey],
  };
}

async function appendVoiceLog({ vaultPath, context, query, answer, notePaths = [], status = 'success', error = '' }) {
  if (!vaultPath) return null;

  const safeVaultPath = await assertAllowedVault(vaultPath);
  const { pageLabel } = normalizeLogContext(context);
  const { date, time } = localDateParts();
  const dirPath = join(safeVaultPath, 'LOG', '語音助理', pageLabel);
  const fileName = `${date}.md`;
  const filePath = join(dirPath, fileName);
  const relativePath = `LOG/語音助理/${pageLabel}/${fileName}`;

  await mkdir(dirPath, { recursive: true });
  const noteList = notePaths.length > 0
    ? notePaths.map(path => `- ${path}`).join('\n')
    : '- 無';
  const block =
    `\n## ${time} ${status === 'success' ? '成功' : '失敗'}\n\n` +
    `- 頁籤：${pageLabel}\n` +
    `- 狀態：${status}\n\n` +
    `### 使用者\n${query || ''}\n\n` +
    `### 助理\n${answer || ''}\n\n` +
    `### 命中筆記\n${noteList}\n` +
    (error ? `\n### 錯誤\n${error}\n` : '');

  await appendFile(filePath, block, 'utf8');
  return relativePath;
}

function detectIntent(query) {
  const q = query.toLowerCase();
  const isCreate = ['建立', '新增', '創建', '幫我寫', '幫我建', '新建', '幫我記', '记录', '記錄', '寫', '写', '建', 'create', 'write'].some(w => q.includes(w));
  const isDiary  = ['日記', '日誌', '日记', '日志', 'diary'].some(w => q.includes(w));
  // 直接說「寫日記」或「記日記」也觸發
  const isDirectDiary = ['寫日記', '写日记', '記日記', '记日记', '寫日誌', '写日志'].some(w => q.includes(w));
  if (isDirectDiary || (isCreate && isDiary)) return 'create_diary';
  return 'query';
}

async function createDiary(vaultPath) {
  const expanded = expandPath(vaultPath);
  if (!expanded) throw new Error('未設定 Vault 路徑，請先在設定頁填寫。');

  const today  = new Date();
  const yyyy   = today.getFullYear();
  const mm     = String(today.getMonth() + 1).padStart(2, '0');
  const dd     = String(today.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const dirPath  = join(expanded, 'Calendar', 'daily note', String(yyyy), mm);
  const fileName = `${dateStr} daily note.md`;
  const filePath = join(dirPath, fileName);
  const relativePath = `Calendar/daily note/${yyyy}/${mm}/${fileName}`;

  try {
    await access(filePath);
    return { created: false, dateStr, relativePath };
  } catch {}

  const content =
    `# 最重要的3件事\n` +
    `- [ ]  \n- [ ]  \n- [ ] \n\n` +
    `# 想要的改變\n\`\`\`\n每天改變一件小事\n\`\`\`\n- [ ]  \n- [ ] \n\n` +
    `# 早晨反思\n\`\`\`\n早上撰寫，5分鐘\n\`\`\`\n` +
    `- 我在想什麼? \n\t1. \n\t2. \n\t3. \n` +
    `- 我感覺如何? \n\t1. \n\t2. \n\t3. \n\n` +
    `# 紀錄生活\n\`\`\`\n生活中發生的事情、心情，5分鐘\n\`\`\`\n` +
    `- objective : 發生了什麼? \n\t1. \n\t2. \n\t3. \n` +
    `- reflective : 帶來什麼情緒感受? \n\t1. \n\t2. \n\t3. \n` +
    `- interpretive : 這件事情為什麼重要? \n\t1. \n\t2. \n\t3. \n` +
    `- 我可以怎樣做的更好 ?\n\t1.  \n\t2. \n\t3. \n` +
    `- 什麼事情讓我有感且值得分享? \n\t1. \n\t2. \n\t3. \n` +
    `- 我從中學到了什麼?\n\t1. \n\t2. \n\t3. \n` +
    `- decisional : 如何應用?\n\t1. \n\t2. \n\t3. \n\n` +
    `# 今天心情\n- 😀: \n- 🤨: \n- 😖: \n\n` +
    `# 其他\n`;

  await mkdir(dirPath, { recursive: true });
  await writeFile(filePath, content, 'utf8');
  return { created: true, dateStr, relativePath };
}

function buildHistoryBlock(history, maxTurns = 6) {
  if (!Array.isArray(history) || history.length === 0) return '';
  const recent = history.slice(-maxTurns);
  return recent.map(m => (m.role === 'user' ? `用戶：${m.text}` : `助理：${m.text}`)).join('\n') + '\n';
}

// POST /voice-chat  { query: string, vaultPath?: string, context?: { pageKey, pageLabel }, history?: Message[] }
router.post('/', async (req, res) => {
  const { query, vaultPath, context, history } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: '請提供查詢文字' });

  try {
    const intent = detectIntent(query.trim());

    if (intent === 'create_diary') {
      const { created, dateStr, relativePath } = await createDiary(vaultPath);
      const answer = created
        ? `好的，已建立 ${dateStr} 的日記，存放在 Calendar daily note 資料夾。`
        : `${dateStr} 的日記已經存在了。`;
      const logPath = await appendVoiceLog({
        vaultPath,
        context,
        query: query.trim(),
        answer,
        notePaths: [relativePath],
      }).catch(err => {
        console.error('[voice-chat-log]', err.message);
        return null;
      });
      return res.json({ answer, noteCount: 0, notePaths: [relativePath], logPath });
    }

    // Default: search & answer
    const searchResult = await searchNotes(query.trim());
    const chunks  = searchResult.chunks ?? [];
    const noteContext = buildContext(chunks);

    const historyBlock = buildHistoryBlock(history);

    let answer;
    if (!noteContext && !historyBlock) {
      answer = '在您的筆記庫中找不到相關內容。';
    } else {
      const prompt =
        `你是語音筆記助理，回答會直接被唸出來給用戶聽。\n` +
        `規則：\n` +
        (historyBlock
          ? `- 優先根據對話歷史保持連貫，筆記片段作為補充參考\n`
          : `- 根據筆記片段回答\n`) +
        `- 回答簡潔口語，控制在 3 句話以內\n` +
        `- 純口語繁體中文，禁止任何 Markdown、條列、標題\n` +
        `- 不要重複說過的話\n\n` +
        (noteContext ? `筆記片段：\n${noteContext}\n\n` : '') +
        (historyBlock ? `對話歷史：\n${historyBlock}\n` : '') +
        `用戶：${query.trim()}\n助理：`;

      const { text } = await runAiCliText(prompt, {
        label: 'voice-chat',
        claudeModel: 'claude-opus-4-7',
        timeoutMs: 30_000,
      });
      answer = text;
    }

    const notePaths = chunks.slice(0, 5).map(c => c.notePath);
    const logPath = await appendVoiceLog({
      vaultPath,
      context,
      query: query.trim(),
      answer,
      notePaths,
    }).catch(err => {
      console.error('[voice-chat-log]', err.message);
      return null;
    });

    res.json({ answer, noteCount: chunks.length, notePaths, logPath });
  } catch (err) {
    console.error('[voice-chat]', err.message);
    appendVoiceLog({
      vaultPath,
      context,
      query: query.trim(),
      answer: '',
      notePaths: [],
      status: 'error',
      error: err.message,
    }).catch(logErr => console.error('[voice-chat-log]', logErr.message));
    if (err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')) {
      return res.status(503).json({ error: '搜尋伺服器未啟動，請確認 local server 正在執行。' });
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
