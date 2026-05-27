## ADDED Requirements

### Requirement: Metadata fields editor in settings
設定頁面中每種筆記類型（fleet/source/permanent）SHALL 提供獨立的 metadata 欄位編輯區塊，允許使用者新增、刪除欄位（欄位名稱 + 預設值）。

#### Scenario: Add a metadata field
- **WHEN** 使用者在 metadata 編輯器中輸入欄位名稱並點擊新增
- **THEN** 新欄位出現在列表中，欄位名稱與預設值可編輯

#### Scenario: Delete a metadata field
- **WHEN** 使用者點擊某個欄位旁的刪除按鈕
- **THEN** 該欄位從列表中移除

#### Scenario: Save metadata fields
- **WHEN** 使用者點擊儲存設定
- **THEN** metadata 欄位列表儲存至 config，頁面重載後仍保留

### Requirement: Body template editor in settings
設定頁面中每種筆記類型 SHALL 提供獨立的模板內文 textarea，與 metadata 區段分開顯示。

#### Scenario: Edit body template
- **WHEN** 使用者在模板內文 textarea 輸入 Markdown 內容並儲存
- **THEN** 儲存至 config，建立新筆記時使用此內文

### Requirement: Note content assembled from metadata and body
建立新筆記時，系統 SHALL 自動將 metadata 欄位組合為 YAML frontmatter，並與模板內文合併，產生完整的 Markdown 內容。

#### Scenario: Create note with metadata fields
- **WHEN** 使用者建立新筆記，且設定中有 metadata 欄位（如 `create date`, `tags`）
- **THEN** 產生的筆記內容開頭為標準 YAML frontmatter（`---` 包夾），接著是模板內文

#### Scenario: Tags field rendered as YAML list
- **WHEN** metadata 欄位名稱為 `tags` 且預設值含逗號分隔的 tag
- **THEN** frontmatter 中 tags 以 YAML list 格式呈現（每個 tag 一行，前綴 `  - `）

### Requirement: Backward compatible migration
讀取設定時，若舊有模板值為純字串，系統 SHALL 自動轉換為新結構。

#### Scenario: Migrate legacy string template
- **WHEN** localStorage 中 template 欄位為純字串
- **THEN** 自動轉為 `{ metadataFields: [], bodyTemplate: <原字串> }`，不遺失內容
