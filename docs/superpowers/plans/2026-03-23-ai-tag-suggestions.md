# AI Tag Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 AllFiles 頁面加入「✨ AI 建議標籤」按鈕，點擊後透過 Python 腳本呼叫 `claude` CLI，根據搜尋語意從現有 tags 中推薦相關標籤，點擊即套用篩選。

**Architecture:** Node.js local server 收到請求後，透過 `child_process.spawn` 呼叫 Python 腳本；Python 腳本構建 prompt 並呼叫 `claude -p` CLI；回傳 JSON 結果給前端。這個模式作為日後所有 AI 功能的標準架構。

**Tech Stack:** Node.js (Express, ES modules), Python 3, `claude` CLI (`/home/willylin/.npm-global/bin/claude`), React + TypeScript

**Spec:** `docs/superpowers/specs/2026-03-23-ai-tag-suggestions-design.md`

---

## File Structure

| 檔案 | 動作 | 職責 |
|------|------|------|
| `local-server/scripts/suggest_tags.py` | 新建 | 讀 stdin JSON，呼叫 `claude -p`，輸出建議 tags |
| `local-server/services/python_runner.js` | 新建 | 通用 Node.js utility：spawn Python 腳本，傳 stdin JSON，回傳 stdout JSON |
| `local-server/routes/suggest-tags.js` | 新建 | POST /suggest-tags：驗證請求，呼叫 python_runner，回傳結果 |
| `local-server/server.js` | 修改 | 註冊 `/suggest-tags` 路由 |
| `src/app/utils/api.ts` | 修改 | `localApi.suggestTags()` |
| `src/app/pages/AllFiles.tsx` | 修改 | 按鈕、建議 chips UI、state 管理 |

---

## Task 1: 建立 Python AI 腳本

**Files:**
- Create: `local-server/scripts/suggest_tags.py`

- [ ] **Step 1: 建立 scripts 目錄**

```bash
mkdir -p local-server/scripts
```

- [ ] **Step 2: 建立 suggest_tags.py**

建立 `local-server/scripts/suggest_tags.py`：

```python
#!/usr/bin/env python3
"""
AI tag suggestion script.
Reads JSON from stdin: { "query": str, "availableTags": [str] }
Outputs JSON to stdout: { "suggestedTags": [str] }
Calls `claude -p` CLI to generate suggestions.
"""

import sys
import json
import subprocess
import re

def suggest_tags(query: str, available_tags: list[str]) -> list[str]:
    if not available_tags:
        return []

    tags_str = ', '.join(available_tags)
    prompt = (
        f"搜尋語意：{query}\n\n"
        f"可用標籤清單：{tags_str}\n\n"
        f"請從可用標籤清單中，選出最符合搜尋語意的標籤（最多 5 個）。"
        f"只回傳一個 JSON 陣列，格式如：[\"tag1\", \"tag2\"]。"
        f"不要加任何說明文字，只輸出 JSON 陣列。"
        f"若無相關標籤，回傳 []。"
    )

    result = subprocess.run(
        ['claude', '-p', prompt, '--output-format', 'text'],
        capture_output=True,
        text=True,
        timeout=30
    )

    if result.returncode != 0:
        raise RuntimeError(f"claude CLI failed: {result.stderr.strip()}")

    raw = result.stdout.strip()

    # Extract JSON array from response
    match = re.search(r'\[.*?\]', raw, re.DOTALL)
    if not match:
        return []

    parsed = json.loads(match.group())
    # Only return tags that exist in availableTags
    return [t for t in parsed if t in available_tags][:5]


def main():
    data = json.load(sys.stdin)
    query = data.get('query', '').strip()
    available_tags = data.get('availableTags', [])

    if not query:
        print(json.dumps({'suggestedTags': [], 'error': 'query is required'}))
        sys.exit(1)

    suggested = suggest_tags(query, available_tags)
    print(json.dumps({'suggestedTags': suggested}))


if __name__ == '__main__':
    main()
```

- [ ] **Step 3: 手動測試 Python 腳本**

```bash
cd local-server
echo '{"query":"閱讀哲學書籍","availableTags":["哲學","閱讀","靈感","待處理","科技"]}' \
  | python3 scripts/suggest_tags.py
```

預期輸出：
```json
{"suggestedTags": ["哲學", "閱讀"]}
```

- [ ] **Step 4: 測試空 tags 邊界情況**

```bash
echo '{"query":"任何搜尋","availableTags":[]}' | python3 local-server/scripts/suggest_tags.py
```

預期輸出：`{"suggestedTags": []}`

- [ ] **Step 5: Commit**

```bash
git add local-server/scripts/suggest_tags.py
git commit -m "feat: add Python AI tag suggestion script using claude CLI

建立 AI 標籤建議腳本，透過 claude CLI 根據搜尋語意從現有 tags 中推薦相關標籤。
這是日後所有 AI 功能的標準 Python + claude CLI 架構模式。"
```

---

## Task 2: 建立 Node.js Python Runner Utility

**Files:**
- Create: `local-server/services/python_runner.js`

- [ ] **Step 1: 建立 python_runner.js**

建立 `local-server/services/python_runner.js`：

```javascript
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(__dirname, '..', 'scripts');

/**
 * 呼叫 Python 腳本，傳入 JSON 資料，回傳 JSON 結果。
 * @param {string} scriptName - scripts/ 目錄下的腳本檔名（含 .py）
 * @param {object} inputData - 傳給腳本 stdin 的 JSON 物件
 * @param {number} timeoutMs - 超時毫秒數，預設 30000
 * @returns {Promise<object>} 腳本 stdout 解析後的 JSON
 */
export async function runPythonScript(scriptName, inputData, timeoutMs = 30000) {
  const scriptPath = join(SCRIPTS_DIR, scriptName);

  return new Promise((resolve, reject) => {
    const py = spawn('python3', [scriptPath]);

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      py.kill();
      reject(new Error(`Python script timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    py.stdout.on('data', (data) => { stdout += data.toString(); });
    py.stderr.on('data', (data) => { stderr += data.toString(); });

    py.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Python script exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        reject(new Error(`Invalid JSON from Python script: ${stdout.trim()}`));
      }
    });

    py.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start Python: ${err.message}`));
    });

    py.stdin.write(JSON.stringify(inputData));
    py.stdin.end();
  });
}
```

- [ ] **Step 2: 手動測試 python_runner（從 Node.js REPL）**

```bash
cd local-server
node --input-type=module <<'EOF'
import { runPythonScript } from './services/python_runner.js';
const result = await runPythonScript('suggest_tags.py', {
  query: '閱讀哲學',
  availableTags: ['哲學', '閱讀', '靈感', '待處理']
});
console.log(result);
EOF
```

預期輸出：`{ suggestedTags: [ '哲學', '閱讀' ] }`

- [ ] **Step 3: Commit**

```bash
git add local-server/services/python_runner.js
git commit -m "feat: add python_runner.js utility for Node.js → Python subprocess calls

建立通用的 Python 腳本呼叫工具，支援 stdin/stdout JSON 傳遞和超時控制。
作為日後所有 AI 功能的標準 Node.js ↔ Python 橋接層。"
```

---

## Task 3: 建立 `/suggest-tags` Route 並註冊

**Files:**
- Create: `local-server/routes/suggest-tags.js`
- Modify: `local-server/server.js`

- [ ] **Step 1: 建立 suggest-tags.js route**

建立 `local-server/routes/suggest-tags.js`：

```javascript
import { Router } from 'express';
import { runPythonScript } from '../services/python_runner.js';

const router = Router();

router.post('/', async (req, res) => {
  const { query, availableTags } = req.body;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: '請提供搜尋文字 (query)' });
  }
  if (!Array.isArray(availableTags)) {
    return res.status(400).json({ error: 'availableTags 必須是陣列' });
  }

  // 若無可用 tags，直接回傳空陣列（不呼叫 Python）
  if (availableTags.length === 0) {
    return res.json({ suggestedTags: [] });
  }

  try {
    const result = await runPythonScript('suggest_tags.py', {
      query: query.trim(),
      availableTags,
    });
    res.json({ suggestedTags: result.suggestedTags || [] });
  } catch (err) {
    console.error('[suggest-tags] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

- [ ] **Step 2: 在 server.js 註冊路由**

修改 `local-server/server.js`：

```javascript
import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health.js';
import searchRouter from './routes/search.js';
import notesRouter from './routes/notes.js';
import suggestTagsRouter from './routes/suggest-tags.js';   // 新增

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

app.use('/health', healthRouter);
app.use('/search', searchRouter);
app.use('/notes', notesRouter);
app.use('/suggest-tags', suggestTagsRouter);                // 新增

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Card Box local server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Search:       POST http://localhost:${PORT}/search`);
  console.log(`Suggest tags: POST http://localhost:${PORT}/suggest-tags`);
});
```

- [ ] **Step 3: 啟動伺服器並手動測試 endpoint**

```bash
cd local-server && node server.js &
sleep 2
curl -s -X POST http://localhost:3001/suggest-tags \
  -H "Content-Type: application/json" \
  -d '{"query":"閱讀哲學書籍","availableTags":["哲學","閱讀","靈感","待處理","科技"]}' | python3 -m json.tool
```

預期輸出：
```json
{
  "suggestedTags": ["哲學", "閱讀"]
}
```

- [ ] **Step 4: 測試 400 錯誤**

```bash
curl -s -X POST http://localhost:3001/suggest-tags \
  -H "Content-Type: application/json" \
  -d '{"availableTags":["哲學"]}' | python3 -m json.tool
```

預期輸出：`{"error": "請提供搜尋文字 (query)"}`

- [ ] **Step 5: 關閉測試伺服器**

```bash
kill %1
```

- [ ] **Step 6: Commit**

```bash
git add local-server/routes/suggest-tags.js local-server/server.js
git commit -m "feat: add POST /suggest-tags endpoint to local server

新增 AI 標籤建議 API endpoint，接收搜尋語意和可用 tags 清單，
透過 Python runner 呼叫 claude CLI 回傳相關標籤建議。"
```

---

## Task 4: 前端 API Client 新增 suggestTags

**Files:**
- Modify: `src/app/utils/api.ts`

- [ ] **Step 1: 在 localApi 新增 suggestTags 方法**

在 `src/app/utils/api.ts` 的 `localApi` 物件中，加在 `search` 方法之後：

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
  return suggestedTags as string[];
},
```

- [ ] **Step 2: 確認 TypeScript 無錯誤**

```bash
cd "/mnt/c/Users/sssss/OneDrive/personal_desk_file/Desktop/vibe_coding_project/Card Box Note Management"
npx tsc --noEmit 2>&1 | head -20
```

預期：無錯誤輸出

- [ ] **Step 3: Commit**

```bash
git add src/app/utils/api.ts
git commit -m "feat: add localApi.suggestTags() for AI tag suggestion API calls

前端 API client 新增 suggestTags 方法，呼叫本地伺服器的 /suggest-tags endpoint。"
```

---

## Task 5: 前端 AllFiles.tsx 加入 AI 建議 UI

**Files:**
- Modify: `src/app/pages/AllFiles.tsx`

- [ ] **Step 1: 新增 state 和 handler**

在 AllFiles.tsx 現有 state 後加入：

```typescript
const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
const [isSuggestingTags, setIsSuggestingTags] = useState(false);
```

新增 `handleSuggestTags` 函數（加在 `handleSearchChange` 之後）：

```typescript
const handleSuggestTags = async () => {
  if (!searchTerm.trim() || allTags.length === 0) return;
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

修改 `handleSearchChange`，搜尋框清空時也清除建議：

```typescript
const handleSearchChange = (value: string) => {
  setSearchTerm(value);
  setPage(0);
  if (!value.trim()) {
    setQmdResult(null);
    setSuggestedTags([]);   // 新增這行
  }
};
```

- [ ] **Step 2: 修改搜尋框，加入 AI 建議按鈕**

在 `src/app/pages/AllFiles.tsx` 找到搜尋框區塊（`{/* Search Bar */}`），將 `<div className="relative">` 改為 flex 容器：

```tsx
{/* Search Bar */}
<div className="mb-6">
  <div className="flex gap-2">
    <div className="relative flex-1">
      {qmdLoading
        ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-blue-400 animate-spin" />
        : <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
      }
      <Input
        type="text"
        placeholder={isObsidianMode ? '向 Obsidian 筆記庫提問，按 Enter 搜尋...' : '搜尋筆記標題或內容...'}
        value={searchTerm}
        onChange={(e) => handleSearchChange(e.target.value)}
        onKeyDown={handleSearchKeyDown}
        className="pl-10"
      />
    </div>
    {!isObsidianMode && (
      <Button
        variant="outline"
        onClick={handleSuggestTags}
        disabled={!searchTerm.trim() || allTags.length === 0 || isSuggestingTags}
        className="flex items-center gap-2 whitespace-nowrap"
      >
        {isSuggestingTags
          ? <Loader2 className="size-4 animate-spin" />
          : <Sparkles className="size-4" />
        }
        AI 建議標籤
      </Button>
    )}
  </div>

  {/* AI 建議 chips */}
  {suggestedTags.length > 0 && (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500">AI 建議：</span>
      {suggestedTags.map(tag => (
        <button
          key={tag}
          onClick={() => toggleTag(tag)}
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm transition-colors ${
            selectedTags.includes(tag)
              ? 'bg-amber-300 text-amber-900'
              : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
          }`}
        >
          #{tag}
          {selectedTags.includes(tag) && <span className="text-xs">✓</span>}
        </button>
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 3: 加入 Sparkles import**

在 `AllFiles.tsx` 的 lucide-react import 加入 `Sparkles`：

```typescript
import { Search, X, Loader2, Plus, Trash2, Sparkles } from 'lucide-react';
```

- [ ] **Step 4: 確認 TypeScript 無錯誤**

```bash
cd "/mnt/c/Users/sssss/OneDrive/personal_desk_file/Desktop/vibe_coding_project/Card Box Note Management"
npx tsc --noEmit 2>&1 | head -20
```

預期：無錯誤

- [ ] **Step 5: 啟動 dev server 手動測試**

```bash
npm run dev
```

測試步驟：
1. 在搜尋框輸入文字（例如「哲學閱讀」）
2. 點「✨ AI 建議標籤」按鈕
3. 確認出現 amber chip 標籤建議
4. 點擊 chip，確認筆記被篩選
5. 清空搜尋框，確認建議消失

- [ ] **Step 6: Commit**

```bash
git add src/app/pages/AllFiles.tsx
git commit -m "feat: add AI tag suggestion UI to AllFiles page

在搜尋框旁加入「AI 建議標籤」按鈕，點擊後呼叫本地 Python/claude CLI
根據搜尋語意推薦相關 tags，以 amber chip 顯示，點擊即套用篩選。"
```

---

## Task 6: Push 所有變更

- [ ] **Step 1: 確認所有 commit 都在**

```bash
cd "/mnt/c/Users/sssss/OneDrive/personal_desk_file/Desktop/vibe_coding_project/Card Box Note Management"
git log --oneline -6
```

- [ ] **Step 2: Push**

```bash
git push
```
