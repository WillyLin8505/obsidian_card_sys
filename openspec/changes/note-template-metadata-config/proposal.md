## Why

目前筆記模板是單一純文字字串，使用者無法分別管理 YAML frontmatter 欄位與模板內文。需要一個結構化的設定介面，讓每個 metadata 欄位可以獨立增刪，確保儲存到 Obsidian 的格式符合標準。

## What Changes

- 將 `fleetNoteTemplate`、`sourceNoteTemplate`、`permanentNoteTemplate` 的資料結構從純字串拆分為兩個部分：metadata 欄位列表 + 模板內文
- 設定頁面新增 Metadata 編輯器：可新增、刪除、排序 YAML frontmatter 欄位（欄位名稱與預設值）
- 設定頁面的模板內文編輯器維持 textarea，但與 metadata 區段分開顯示
- 儲存/建立筆記時，自動組合 metadata + 內文，產生標準 YAML frontmatter 格式

## Capabilities

### New Capabilities
- `note-template-metadata-editor`: 設定頁面中針對每種筆記類型，提供結構化的 metadata 欄位編輯器（新增/刪除/排序欄位名稱與預設值），以及獨立的模板內文 textarea

### Modified Capabilities

## Impact

- `src/app/types/note.ts`：Config 型別中的 template 欄位需擴充為結構化型別
- `src/app/pages/Config.tsx`：設定頁面 UI 需新增 metadata 編輯區塊
- `src/app/utils/storage.ts`：讀寫設定時需相容新舊格式
- 建立筆記的邏輯（FleetNotes、SourceNotes、NoteView）：組合 metadata + 內文時需使用新結構
