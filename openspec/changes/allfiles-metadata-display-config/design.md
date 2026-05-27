## Context

AllFiles 頁面目前的筆記卡片只顯示標題、類型、標籤和內文摘要。使用者有大量已存在的 Obsidian 筆記，各自帶有不同的 YAML frontmatter（如 `create date`、`aliases`、`tags` 等），希望能在卡片上選擇性地顯示這些欄位。

欄位清單必須從**實際筆記**中讀取，而非從模板推導，因為：
1. 既有筆記的欄位不一定與目前模板設定相符
2. 使用者可能有多種不同結構的筆記

## Goals / Non-Goals

**Goals:**
- 設定頁面掃描所有現有筆記的 frontmatter，聚合出所有出現過的欄位 key 供使用者勾選
- AllFiles 卡片根據 `displayMetadataKeys` 解析並顯示對應的 frontmatter 值
- 支援 Obsidian vault 的大量筆記（透過 `storage.getNotes()` 取得）

**Non-Goals:**
- 不即時同步（每次開啟設定頁面才重新掃描）
- 不支援依筆記類型顯示不同欄位

## Decisions

### 欄位來源：掃描所有筆記的 frontmatter

在設定頁面載入時，呼叫 `storage.getNotes()` 取得所有筆記，解析每張筆記 `content` 的 YAML frontmatter，收集所有出現過的 key，去重複後排序，作為可勾選欄位清單。

**相對於從模板推導的優勢**：能涵蓋既有筆記中所有實際欄位，不受限於當前模板設定。

### 儲存：`displayMetadataKeys: string[]` 加入 Config

在 `Config` 型別新增 `displayMetadataKeys: string[]`，預設為空陣列。選擇加入 Config 而非另開儲存：Config 本來就是使用者偏好設定的集中地。

### Frontmatter 解析：共用 utility function

新增 `parseFrontmatterKeys(content: string): string[]` 和 `parseFrontmatterValue(content: string, key: string): string` 兩個 utility functions，放在 `src/app/utils/frontmatter.ts`：
- 前者解析所有欄位 key（用於設定頁面聚合）
- 後者解析單一欄位值（用於卡片顯示），YAML list 格式合併為逗號分隔字串

用 regex 解析而非引入完整 YAML 解析函式庫，保持輕量。

### 卡片顯示位置

在 AllFiles 的 NoteCard 元件（或 AllFiles 內的卡片 render 邏輯）中，在標籤下方顯示 metadata 欄位，格式為小字 `key: value`，以灰色文字呈現，不搶奪主視覺焦點。

## Risks / Trade-offs

- [Risk] 筆記數量龐大時，設定頁面載入掃描所有筆記會有延遲 → Mitigation: 顯示 loading 狀態，掃描為非同步
- [Risk] frontmatter 格式不標準（如沒有結尾 `---`）→ Mitigation: regex 解析失敗時靜默跳過
- [Trade-off] 每次 render 卡片都做 regex 解析 → 在筆記數量大時有輕微效能影響，acceptable for now
