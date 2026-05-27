## 1. 資料結構與型別

- [x] 1.1 在 `src/app/types/note.ts` 新增 `MetadataField` 與 `NoteTemplateConfig` 介面
- [x] 1.2 將 `Config` 型別中的 `fleetNoteTemplate`、`sourceNoteTemplate`、`permanentNoteTemplate` 改為 `NoteTemplateConfig`

## 2. Storage Migration

- [x] 2.1 在 `src/app/utils/storage.ts` 的 `getConfig()` 新增 migration 邏輯：偵測舊有字串格式並轉換為新結構
- [x] 2.2 舊模板字串若包含 YAML frontmatter，自動解析拆分為 metadataFields + bodyTemplate

## 3. buildNoteContent Helper

- [x] 3.1 新增 `src/app/utils/buildNoteContent.ts`，實作 `buildNoteContent(template: NoteTemplateConfig): string`
- [x] 3.2 處理 tags 欄位：若 defaultValue 含逗號，轉為 YAML list 格式（`  - tag`）
- [x] 3.3 組合結果：YAML frontmatter（`---` 包夾）+ 空行 + bodyTemplate

## 4. 設定頁面 UI

- [ ] 4.1 在 `Config.tsx` 為每種筆記類型新增 MetadataFields 編輯器元件（顯示欄位列表，每列有 key input、value input、刪除按鈕）
- [ ] 4.2 新增「+ 新增欄位」按鈕，點擊後在列表末新增空白欄位
- [ ] 4.3 模板內文 textarea 與 metadata 編輯器分區顯示，各有明確標題
- [x] 4.4 `handleSave()` 收集 metadataFields + bodyTemplate 存入 config

## 5. 建立筆記邏輯更新

- [x] 5.1 更新 `AllFiles.tsx` 的 `handleCreateNote()`：改用 `buildNoteContent(config.fleetNoteTemplate)` 等產生初始內容
- [x] 5.2 更新 `SourceNotes.tsx` 的建立筆記邏輯
- [x] 5.3 確認 `NoteView.tsx` 建立筆記時也使用新的 helper

## 6. 驗證

- [ ] 6.1 在設定頁面新增 metadata 欄位後儲存，確認 localStorage 格式正確
- [ ] 6.2 建立新的 fleet note，確認產生的內容包含正確的 YAML frontmatter + 模板內文
- [ ] 6.3 舊設定（純字串模板）在重載後仍可正常運作（migration 成功）
