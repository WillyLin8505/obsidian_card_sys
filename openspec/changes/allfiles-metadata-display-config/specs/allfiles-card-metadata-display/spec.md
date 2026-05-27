## ADDED Requirements

### Requirement: Config 儲存顯示欄位清單
`Config` 型別 SHALL 包含 `displayMetadataKeys: string[]`，儲存使用者選擇要在 AllFiles 卡片顯示的 frontmatter 欄位名稱列表。

#### Scenario: 預設值
- **WHEN** 使用者從未設定過 `displayMetadataKeys`
- **THEN** 預設值為空陣列（不顯示任何 metadata 欄位）

#### Scenario: 儲存後讀取
- **WHEN** 使用者在設定頁面勾選若干欄位並儲存
- **THEN** 重新載入後 `displayMetadataKeys` 仍包含那些欄位名稱

### Requirement: 設定頁面從現有筆記掃描可用欄位
設定頁面 SHALL 在載入時掃描所有現有筆記的 YAML frontmatter，聚合出所有出現過的欄位 key，以 checkbox 列表呈現供使用者勾選。

#### Scenario: 掃描所有筆記
- **WHEN** 使用者開啟設定頁面
- **THEN** 系統呼叫 `storage.getNotes()` 取得所有筆記，解析每張筆記 content 的 frontmatter，收集所有 key 去重複排序後顯示

#### Scenario: 勾選狀態反映已儲存設定
- **WHEN** 設定頁面載入完成
- **THEN** 已在 `displayMetadataKeys` 中的欄位顯示為勾選狀態

#### Scenario: 載入中顯示狀態
- **WHEN** 掃描筆記尚未完成
- **THEN** 顯示載入中提示

#### Scenario: 無現有筆記或筆記均無 frontmatter
- **WHEN** 所有筆記均無 YAML frontmatter
- **THEN** 顯示提示文字「目前沒有筆記包含 metadata 欄位」

### Requirement: AllFiles 卡片顯示所選欄位值
AllFiles 頁面的筆記卡片 SHALL 解析 note.content 的 YAML frontmatter，並顯示 `displayMetadataKeys` 中所有欄位的值。

#### Scenario: 有 frontmatter 且欄位存在
- **WHEN** 卡片對應的 note.content 包含 YAML frontmatter，且 frontmatter 中存在 displayMetadataKeys 指定的欄位
- **THEN** 卡片在內容摘要上方顯示小字「key: value」格式的欄位資訊

#### Scenario: 欄位值為 YAML list（如 tags）
- **WHEN** frontmatter 中該欄位的值為 YAML list 格式（`  - item` 縮排列表）
- **THEN** 卡片顯示合併後的字串，例如 `tags: tagA, tagB`

#### Scenario: 欄位不存在或值為空
- **WHEN** frontmatter 中不含指定欄位，或值為空字串
- **THEN** 該欄位不顯示（跳過）

#### Scenario: note 無 frontmatter
- **WHEN** note.content 不含 YAML frontmatter
- **THEN** 不顯示任何 metadata 欄位

#### Scenario: displayMetadataKeys 為空
- **WHEN** `displayMetadataKeys` 為空陣列
- **THEN** 卡片不顯示任何 metadata 欄位
