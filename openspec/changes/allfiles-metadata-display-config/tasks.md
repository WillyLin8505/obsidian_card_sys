## 1. 資料結構

- [x] 1.1 在 `src/app/types/note.ts` 的 `Config` 介面新增 `displayMetadataKeys: string[]`
- [x] 1.2 在 `src/app/utils/storage.ts` 的 `DEFAULT_CONFIG` 新增 `displayMetadataKeys: []`

## 2. Frontmatter Utility

- [x] 2.1 新增 `src/app/utils/frontmatter.ts`，實作 `parseFrontmatterKeys(content: string): string[]`（解析所有 frontmatter key）
- [x] 2.2 在同檔案實作 `parseFrontmatterValue(content: string, key: string): string`（解析單一欄位值，YAML list → 逗號合併字串）

## 3. 設定頁面 UI

- [x] 3.1 在 `Config.tsx` 新增 `displayMetadataKeys` state（從 config 初始化）
- [x] 3.2 新增 `availableMetadataKeys` state 與載入狀態，頁面 mount 時呼叫 `storage.getNotes()` 掃描所有筆記的 frontmatter key
- [x] 3.3 新增「AllFiles 卡片顯示欄位」區塊：載入中顯示提示，載入完後列出 checkbox 讓使用者勾選
- [x] 3.4 `handleSave()` 收集 `displayMetadataKeys` 並存入 config

## 4. AllFiles 卡片顯示

- [x] 4.1 在 `AllFiles.tsx` 讀取 `config.displayMetadataKeys`
- [x] 4.2 在筆記卡片 render 中，使用 `parseFrontmatterValue` 取得各欄位值，顯示在卡片上（欄位值為空則跳過）

## 5. 驗證

- [ ] 5.1 設定頁面勾選欄位後儲存，確認 localStorage 的 `displayMetadataKeys` 更新正確（手動驗證）
- [ ] 5.2 AllFiles 卡片顯示對應的 frontmatter 欄位值（手動驗證）
- [ ] 5.3 無 frontmatter 的筆記卡片不顯示任何 metadata 欄位（手動驗證）
