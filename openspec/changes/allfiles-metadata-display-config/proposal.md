## Why

使用者希望在「所有檔案」頁面的筆記卡片上，能自行選擇顯示哪些 YAML frontmatter metadata 欄位（例如 `tags`、`create date`、`aliases`）。可選欄位應來自**現有筆記實際擁有的欄位**，而非僅限於模板設定，因為使用者已有大量既存筆記且各自有不同的 frontmatter。

## What Changes

- 在 `Config` 型別中新增 `displayMetadataKeys: string[]`，儲存使用者選擇要顯示的欄位名稱
- 在設定頁面新增「AllFiles 卡片顯示欄位」區塊：**掃描所有現有筆記**的 frontmatter，聚合出所有出現過的欄位 key，以 checkbox 讓使用者勾選
- `AllFiles.tsx` 的筆記卡片改為根據 `displayMetadataKeys` 動態顯示對應的 frontmatter 欄位值
- `storage.ts` 的 `DEFAULT_CONFIG` 加入 `displayMetadataKeys` 預設值（空陣列）

## Capabilities

### New Capabilities
- `allfiles-card-metadata-display`: 在 AllFiles 筆記卡片上根據設定動態顯示 YAML frontmatter metadata 欄位

### Modified Capabilities

## Impact

- `src/app/types/note.ts`: `Config` 型別新增 `displayMetadataKeys`
- `src/app/utils/storage.ts`: DEFAULT_CONFIG 新增預設值
- `src/app/pages/Config.tsx`: 新增 metadata 顯示欄位勾選 UI，掃描現有筆記取得欄位清單
- `src/app/pages/AllFiles.tsx`: 筆記卡片顯示 frontmatter metadata
