## 1. 後端：查詢展開端點

- [x] 1.1 在 `local-server/routes/` 新增 `expand-query.js`：`POST /expand-query`，接收 `{ query }`，驗證參數非空
- [x] 1.2 在 `expand-query.js` 中使用 `child_process.spawn` 執行 `claude -p "<prompt>"`，prompt 要求回傳 5–10 個語義相關繁體中文關鍵字的 JSON 陣列
- [x] 1.3 收集 stdout，解析 JSON，回傳 `{ keywords: string[] }`；spawn 失敗或 JSON 解析失敗時回傳 HTTP 500
- [x] 1.4 在 `local-server/server.js` 註冊 `/expand-query` 路由

## 2. 前端 API 層

- [x] 2.1 在 `src/app/utils/api.ts` 的 `localApi` 新增 `expandQuery(query: string): Promise<string[]>` 方法，呼叫 `POST /expand-query`

## 3. AllFiles 搜尋狀態機

- [x] 3.1 在 `AllFiles.tsx` 新增 `searchMode: 'text' | 'semantic'` state，預設 `'text'`
- [x] 3.2 新增 `expandedKeywords: string[]` 與 `isExpandingQuery: boolean` state
- [x] 3.3 搜尋列 `onKeyDown` 處理 Enter：設 `isExpandingQuery = true`，呼叫 `localApi.expandQuery()`，成功後存入 `expandedKeywords`，切換 `searchMode = 'semantic'`；處理 Escape：重置回 text 模式
- [x] 3.4 搜尋列 `onChange` 時若 `value === ''`，重置 `searchMode = 'text'` 並清除 `expandedKeywords`

## 4. AllFiles 搜尋邏輯

- [x] 4.1 `filteredNotes` 的 `useMemo` 依 `searchMode` 分支：text 模式用原有字串比對；semantic 模式用 `expandedKeywords` 做聯集比對（任一 keyword 出現在 title 或 content 即符合，case-insensitive）

## 5. UI 更新

- [x] 5.1 搜尋列右側加入模式圖示：text 模式顯示 Search icon，semantic 模式顯示 Sparkles，loading 中顯示 Loader2（spinning）
- [x] 5.2 搜尋列下方顯示 `expandedKeywords` Badges：每個 Badge 有 X 按鈕，點擊後從 `expandedKeywords` 移除，搜尋結果自動更新
- [x] 5.3 API 呼叫失敗時呼叫 `toast.error()` 並維持 text 模式

## 6. 驗證

- [ ] 6.1 輸入文字不按 Enter，確認即時過濾行為不變（手動驗證）
- [ ] 6.2 按 Enter 後顯示 Loader2，API 回傳後顯示展開關鍵字 Badges 與語義搜尋結果（手動驗證）
- [ ] 6.3 點擊 Badge X 移除關鍵字，搜尋結果隨之更新（手動驗證）
- [ ] 6.4 清空搜尋列或按 Escape，回到 text 模式並清除 Badges（手動驗證）
