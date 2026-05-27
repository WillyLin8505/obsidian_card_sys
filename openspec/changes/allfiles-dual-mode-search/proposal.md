## Why

目前 AllFiles 的搜尋只做簡單文字比對，使用者輸入「如何學好英文」找不到標題是「時間管理技巧」或「習慣養成」的相關筆記。加入 AI 語義展開搜尋，讓使用者在需要時（按 Enter）可以用自然語言找到語義相關但關鍵字不同的筆記。

## What Changes

- 搜尋列維持即時文字過濾（不按 Enter），行為不變
- 按 Enter 後切換為「語義展開模式」：呼叫 Claude API 將查詢展開為多個語義字段，再用展開的字段對所有筆記做聯集模糊搜尋
- 搜尋列顯示目前所在模式（文字模式 / 語義模式）的視覺提示
- 展開的語義字段以 Badge 形式顯示在搜尋列下方，讓使用者知道 AI 用了哪些字搜尋
- 按 Escape 或清空搜尋列時重置回文字模式

## Capabilities

### New Capabilities
- `semantic-query-expansion`: 按 Enter 後呼叫 AI 將查詢展開為語義字段，並用展開字段做聯集搜尋

### Modified Capabilities

## Impact

- `src/app/pages/AllFiles.tsx`: 搜尋狀態機、Enter 鍵事件處理、語義結果顯示
- `src/app/utils/api.ts` 或新增 `src/app/utils/semanticSearch.ts`: 呼叫 Claude API 做查詢展開
- 需要 Claude API key（已透過 local-server 提供，或直接呼叫）
