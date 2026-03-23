# AI Tag Suggestions Design Spec

**Date:** 2026-03-23
**Feature:** 在「所有檔案」頁面加入 AI 語意標籤建議

---

## Goal

在 AllFiles 頁面的搜尋框旁加一個「✨ AI 建議標籤」按鈕。點擊後，AI 根據搜尋框的語意，從現有的 tags 中挑出相關標籤，以 chip 形式顯示。點擊 chip 立即套用為篩選條件。

---

## Architecture

### Data Flow

```
用戶輸入搜尋文字
→ 點「✨ AI 建議標籤」按鈕
→ AllFiles.tsx 收集 { query: searchTerm, availableTags: allTags }
→ POST http://localhost:3001/suggest-tags
→ local-server routes/suggest-tags.js 接收請求
→ 從 process.env.CLAUDE_API_KEY 取得 API key
→ 呼叫 services/claude.js suggestTags(query, availableTags, apiKey)
→ Claude API 分析語意，從 availableTags 回傳相關 tags（JSON array）
→ 回傳 { suggestedTags: string[] }
→ AllFiles.tsx 顯示建議 chips
→ 點擊 chip → 呼叫 toggleTag(tag) → 加入 selectedTags → 篩選筆記
```

### Response Schema

```
SUCCESS: { suggestedTags: string[] }
ERROR:   { error: string }           (HTTP 4xx/5xx)
```

---

## Files to Change

| 檔案 | 動作 |
|------|------|
| `local-server/routes/suggest-tags.js` | 新建 |
| `local-server/services/claude.js` | 新增 `suggestTags()` named export |
| `local-server/server.js` | import + 註冊新路由 |
| `src/app/utils/api.ts` | `localApi` 加入 `suggestTags()` |
| `src/app/pages/AllFiles.tsx` | 按鈕、chips UI、state 管理 |

---

## Backend Implementation

### `local-server/routes/suggest-tags.js` (新建)

```javascript
import { Router } from 'express';
import { suggestTags } from '../services/claude.js';

const router = Router();

router.post('/', async (req, res) => {
  const { query, availableTags } = req.body;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: '請提供搜尋文字 (query)' });
  }
  if (!Array.isArray(availableTags)) {
    return res.status(400).json({ error: 'availableTags 必須是陣列' });
  }

  // 若無可用 tags，直接回傳空陣列（不呼叫 Claude）
  if (availableTags.length === 0) {
    return res.json({ suggestedTags: [] });
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'CLAUDE_API_KEY 未設定' });
  }

  try {
    const suggestedTags = await suggestTags(query.trim(), availableTags, apiKey);
    res.json({ suggestedTags });
  } catch (err) {
    console.error('[suggest-tags] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

### `local-server/services/claude.js` 新增函數

新增 named export `suggestTags`：

```javascript
export async function suggestTags(query, availableTags, apiKey) {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: `你是語意標籤建議助理。根據使用者的搜尋語意，從提供的標籤清單中挑選最相關的標籤（最多 5 個）。
只回傳一個 JSON 陣列，格式如：["tag1", "tag2"]。
若無相關標籤，回傳空陣列 []。
不要加任何說明文字，只輸出 JSON。`,
    messages: [
      {
        role: 'user',
        content: `搜尋語意：${query}\n\n可用標籤清單：${availableTags.join(', ')}`,
      },
    ],
  });

  const raw = message.content[0]?.type === 'text' ? message.content[0].text.trim() : '[]';
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(t => availableTags.includes(t)) : [];
  } catch {
    return [];
  }
}
```

### `local-server/server.js` 修改

```javascript
import suggestTagsRouter from './routes/suggest-tags.js';
// ...
app.use('/suggest-tags', suggestTagsRouter);
```

---

## Frontend Implementation

### `src/app/utils/api.ts` — `localApi` 新增方法

```typescript
suggestTags: async (query: string, availableTags: string[]): Promise<string[]> => {
  const baseUrl = getObsidianBackendUrl();
  const response = await fetch(`${baseUrl}/suggest-tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, availableTags }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || 'Tag suggestion failed');
  }
  const { suggestedTags } = await response.json();
  return suggestedTags;
},
```

### `src/app/pages/AllFiles.tsx` 修改

**新增 state：**
```typescript
const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
const [isSuggestingTags, setIsSuggestingTags] = useState(false);
```

**按鈕 disabled 條件：**
- `searchTerm.trim() === ''` 或 `allTags.length === 0` 或 `isSuggestingTags`

**`handleSearchChange` 補充：**
```typescript
if (!value.trim()) setSuggestedTags([]);
```

**`handleSuggestTags` 函數：**
```typescript
const handleSuggestTags = async () => {
  setIsSuggestingTags(true);
  try {
    const suggestions = await localApi.suggestTags(searchTerm, allTags);
    setSuggestedTags(suggestions);
    if (suggestions.length === 0) toast.info('找不到相關標籤');
  } catch (err: any) {
    toast.error(`AI 建議失敗: ${err.message}`);
  } finally {
    setIsSuggestingTags(false);
  }
};
```

---

## UI Layout

```
┌──────────────────────────────────────────────────────────┐
│ [🔍 搜尋框...              ] [✨ AI 建議標籤 / spinner]  │
│                                                          │
│ AI 建議：[#靈感 ✓] [#閱讀] [#哲學]                      │
│                                                          │
│ 標籤篩選：[#inbox] [#待處理] ...                         │
└──────────────────────────────────────────────────────────┘
```

- 按鈕與搜尋框同一 flex row，靠右
- AI 建議 chips 出現在搜尋框下方、標籤篩選上方
- Chip 樣式（未選取）：`bg-amber-100 text-amber-800`
- Chip 樣式（已在 selectedTags）：`bg-amber-300 text-amber-900`（加深，表示已選取）
- 建議 chips 區塊：僅在 `suggestedTags.length > 0` 時顯示

---

## Error Handling

| 情況 | 處理 |
|------|------|
| 本地伺服器未啟動 | `toast.error('AI 建議失敗: ...')` |
| CLAUDE_API_KEY 未設定 | server 回傳 500，前端顯示 toast |
| availableTags 為空 | 按鈕 disabled |
| Claude 回傳無相關 tags | `toast.info('找不到相關標籤')` |
| searchTerm 清空 | 自動清除 suggestedTags |

---

## Out of Scope

- 不支援 Obsidian mode
- 不自動建立新 tag（只從現有 tags 中挑選）
- 不儲存建議歷史
