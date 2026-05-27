## ADDED Requirements

### Requirement: 後端提供查詢展開端點
Local-server SHALL 提供 `POST /expand-query` 端點，接收 `{ query: string }`，呼叫 Claude API 將查詢展開為語義相關關鍵字，回傳 `{ keywords: string[] }`（5–10 個繁體中文關鍵字）。

#### Scenario: 成功展開
- **WHEN** 收到有效的 query 字串
- **THEN** 回傳包含 5–10 個語義相關關鍵字的 JSON 陣列

#### Scenario: 空查詢
- **WHEN** query 為空字串
- **THEN** 回傳 HTTP 400 錯誤

### Requirement: 前端 localApi 新增 expandQuery 方法
`localApi` SHALL 新增 `expandQuery(query: string): Promise<string[]>` 方法，呼叫後端 `/expand-query`。

#### Scenario: 呼叫成功
- **WHEN** local-server 正常運作
- **THEN** 回傳關鍵字陣列

#### Scenario: 呼叫失敗
- **WHEN** local-server 無法連線
- **THEN** 拋出 Error，由呼叫方處理

### Requirement: 文字模式即時搜尋（維持原行為）
AllFiles 搜尋列 SHALL 在使用者輸入但未按 Enter 時，以輸入字串對筆記標題與內容做即時過濾，行為與現在相同。

#### Scenario: 輸入文字
- **WHEN** 使用者在搜尋列輸入文字
- **THEN** 即時過濾筆記，搜尋列顯示文字模式圖示（🔍）

### Requirement: 語義展開模式
AllFiles 搜尋列 SHALL 在使用者按下 Enter 後切換為語義模式：呼叫 AI 展開查詢，用展開的關鍵字做聯集搜尋。

#### Scenario: 按 Enter 觸發語義搜尋
- **WHEN** 使用者在搜尋列按下 Enter（且搜尋列非空）
- **THEN** 顯示 loading 狀態，呼叫 `localApi.expandQuery()`，切換為語義模式（✨），展示展開的關鍵字 Badge，顯示符合任一關鍵字的筆記

#### Scenario: 展開關鍵字顯示
- **WHEN** 語義模式啟動完成
- **THEN** 搜尋列下方顯示 AI 展開的關鍵字 Badges，使用者可點擊個別 Badge 移除該字段以縮小結果

#### Scenario: 移除關鍵字 Badge
- **WHEN** 使用者點擊某個關鍵字 Badge 的 X
- **THEN** 該關鍵字從展開列表移除，搜尋結果重新計算

#### Scenario: API 呼叫失敗
- **WHEN** local-server 無法連線或回傳錯誤
- **THEN** 顯示 toast 錯誤提示，維持文字模式搜尋結果

### Requirement: 重置回文字模式
AllFiles 搜尋列 SHALL 在使用者清空搜尋列或按 Escape 時，重置回文字模式並清除語義關鍵字。

#### Scenario: 清空搜尋列
- **WHEN** 使用者清空搜尋列（手動刪除或點擊 X）
- **THEN** 模式重置為文字模式，展開的關鍵字 Badges 消失

#### Scenario: 按 Escape
- **WHEN** 使用者在搜尋列按 Escape
- **THEN** 模式重置為文字模式，展開的關鍵字 Badges 消失
