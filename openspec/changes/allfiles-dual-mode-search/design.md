## Context

AllFiles 目前只有即時文字過濾。語義展開搜尋需要 AI 將自然語言查詢拆解為多個關鍵字。本設計使用已安裝的 `claude` CLI（Claude Code CLI）執行查詢展開，不需要額外管理 API key。

## Goals / Non-Goals

**Goals:**
- 文字模式（輸入中）：行為完全不變，即時過濾
- 語義模式（Enter 後）：shell out 到 `claude` CLI 展開查詢為語義字段，用展開字段做聯集模糊搜尋
- 展開的字段以 Badge 顯示在搜尋列下方，可個別移除
- ESC 或清空搜尋列時回到文字模式

**Non-Goals:**
- 不使用 Anthropic SDK / API key
- 不做向量搜尋，展開的是關鍵字，用字串包含比對

## Decisions

### 後端新增 `POST /expand-query`，透過 claude CLI 執行

使用 Node.js `child_process.spawn` 執行：
```
claude -p "<prompt>"
```

Prompt 內容：
> 請將以下查詢展開為 5–10 個語義相關的繁體中文搜尋關鍵字（每個 2–6 個字），只回傳 JSON 陣列，不要解釋，格式：["關鍵字1","關鍵字2",...]。查詢：{query}

`spawn` 收集 stdout，解析 JSON 後回傳 `{ keywords: string[] }`。

選擇 claude CLI 而非 SDK：
- 不需要在 server 端管理 API key
- 使用者已安裝並登入 Claude Code CLI，直接沿用既有認證
- 與 `suggest-tags.js` 使用 Python script 的模式類似（shell out 模式）

### 前端搜尋狀態機

```
searchMode: 'text' | 'semantic'
expandedKeywords: string[]
isExpandingQuery: boolean
```

- 輸入中 → text 模式，即時過濾
- 按 Enter → 呼叫 API，切換 semantic 模式，顯示 expandedKeywords badges
- 清空或按 ESC → 重置回 text 模式

### 語義搜尋比對

聯集搜尋：筆記的 `title + content` 中只要包含任一 keyword（case-insensitive）即納入結果。

### 錯誤處理

- claude CLI 未安裝或執行失敗：toast 錯誤提示，保持 text 模式結果
- JSON 解析失敗：同上

### UI 提示

搜尋列右側圖示區分模式（text：Search icon，semantic：Sparkles icon，loading：Loader2）。展開 keyword 以淺色 Badge 顯示在搜尋列下方，有 X 可移除。

## Risks / Trade-offs

- [Risk] claude CLI 執行速度比 SDK 直接呼叫略慢（CLI 啟動開銷）→ Mitigation: 顯示 loading 狀態，使用者感知可接受
- [Risk] claude CLI 路徑在不同環境可能不同 → Mitigation: 用 `which claude` 或直接 `claude`，讓系統 PATH 解析
- [Trade-off] 關鍵字字串比對精確度不如向量搜尋 → 展開多個關鍵字已大幅提升召回率
