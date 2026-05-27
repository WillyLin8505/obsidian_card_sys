## Context

目前 `Config` 型別中的三個模板欄位（`fleetNoteTemplate`、`sourceNoteTemplate`、`permanentNoteTemplate`）都是純字串。建立筆記時直接將字串插入。使用者若想調整 YAML frontmatter 欄位，需要手動編輯整個模板字串，容易格式錯誤。

## Goals / Non-Goals

**Goals:**
- 將模板資料結構拆分為 `metadataFields`（YAML 欄位列表）+ `bodyTemplate`（內文字串）
- 設定頁面提供獨立的 metadata 欄位編輯器（新增/刪除/排序）
- 儲存/建立筆記時自動組合成標準 YAML frontmatter 格式
- 向下相容：舊有的純字串模板設定自動 migrate

**Non-Goals:**
- 不支援複雜 YAML 型別（array、nested object）的視覺化編輯，欄位 value 一律為純字串或留空
- 不改變筆記本身的資料結構，只影響「建立新筆記時的初始內容」

## Decisions

**1. 資料結構：新增 `NoteTemplateConfig` 型別**
```typescript
interface MetadataField {
  key: string;
  defaultValue: string;
}

interface NoteTemplateConfig {
  metadataFields: MetadataField[];
  bodyTemplate: string;
}
```
原有的 `fleetNoteTemplate: string` 改為 `fleetNoteTemplate: NoteTemplateConfig`。
*為何不保留字串*：混合型別會讓 migration 邏輯複雜，統一用新結構較清晰。

**2. Migration：storage 讀取時自動轉換**
若 localStorage 中的 template 值是字串，自動轉為 `{ metadataFields: [], bodyTemplate: <原字串> }`。不需要手動 migration 步驟。

**3. YAML 組合邏輯：集中在 `buildNoteContent()` utility**
新增一個 helper function，接收 `NoteTemplateConfig` 回傳完整的 markdown 字串：
```
---
key1: value1
key2: value2
---

<bodyTemplate>
```
建立筆記的各頁面統一呼叫此 helper。

## Risks / Trade-offs

- [tags 欄位的 list 格式] YAML tags 通常是 list（`- tag1`），但我們的 value 只支援字串。→ 暫時讓使用者在 defaultValue 欄位直接填寫 `\n  - tag1\n  - tag2`，或用逗號分隔後由 helper 轉換。
- [既有模板字串包含 frontmatter] 若舊模板字串已包含 `---` frontmatter，migration 後 bodyTemplate 會包含重複的 frontmatter。→ migration 時偵測並解析既有 frontmatter，自動拆分。
