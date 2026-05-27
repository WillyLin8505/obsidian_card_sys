---
name: ai-link-suggest
description: Design and implement AI-powered link suggestion engine to reduce manual organization effort (SCAMPER-M strategy)
allowed-tools: Read, Write, Glob, Grep
---

# AI 連結建議引擎

SCAMPER-M（放大）策略實作：放大 AI 輔助連結建議，降低用戶主動整理的認知負荷，讓知識網絡自動生長。

## 使用方式
```
/ai-link-suggest [design|pipeline|evaluate]
```

## 參數
- `design`：產出 AI 連結建議系統架構設計
- `pipeline`：定義語義比對 pipeline
- `evaluate`：定義建議品質評估標準

## 五個為什麼提醒

> 根因：設計師聚焦在「新增」體驗，忽略「回顧」體驗。
> → 解法：AI 在用戶寫作時即時建議相關卡片，無需用戶主動搜尋。

## AI 建議觸發機制

| 觸發點 | 建議類型 | 優先級 |
|--------|---------|--------|
| 用戶正在編輯卡片（即時） | 語義相似卡片 | 高 |
| 卡片儲存時 | 未連結但高度相關的卡片 | 中 |
| Inbox 整理時 | 可合併的重複卡片 | 中 |
| 每日回顧時 | 長期未連結的孤兒卡片 | 低 |

## 執行步驟

### 1. 確認 AI 技術棧

讀取 `.knowledge/architecture.md` 確認：
- 是否已選定 Embedding 模型（建議：`text-embedding-3-small` 或 `BGE-M3`）
- 向量資料庫選型（建議：pgvector / Qdrant）
- 現有 LLM API 整合情況

### 2. 設計語義比對 Pipeline

```
[用戶輸入文字]
      ↓
[Embedding 模型] → 產生 768/1536 維向量
      ↓
[向量資料庫 ANN 搜尋] → Top-K 相似卡片（K=10）
      ↓
[重排序（Reranker）] → 考慮連結歷史、時間衰減、用戶行為
      ↓
[建議呈現] → 顯示 Top-3，附相關片段高亮
```

### 3. 設計建議 API

```
POST /ai/suggest-links
Body: {
  card_id: string,
  content: string,      // 當前卡片內容
  trigger: 'realtime' | 'on_save' | 'daily_review'
}
Response: {
  suggestions: Array<{
    card_id: string,
    title: string,
    relevance_score: number,   // 0-1
    context_snippet: string,   // 相關段落
    reason: string             // AI 解釋（一句話）
  }>
}
```

### 4. 設計建議 UI 互動模式

```
寫作介面右側浮動面板：
┌─────────────────────┐
│ 💡 可能相關的卡片    │
├─────────────────────┤
│ 📄 [卡片標題 A]     │
│   "...相關文字片段..."│
│   [建立連結] [忽略]  │
├─────────────────────┤
│ 📄 [卡片標題 B]     │
│   ...               │
└─────────────────────┘
```

### 5. 建議品質評估標準

定義以下指標：
- **Precision@3**：Top-3 建議中，用戶接受率 > 40%（MVP 目標）
- **Cold Start 方案**：用戶卡片 < 10 張時，改用關鍵字比對
- **冷熱資料分層**：近 30 天活躍卡片優先入向量索引

### 6. 產出架構設計文件

寫入 `.knowledge/architecture.md` 的「AI 連結建議」章節：
- 系統架構圖（文字版）
- Embedding 更新策略（即時 vs 批次）
- 向量資料庫選型決策

## 驗收標準

- [ ] 語義比對 pipeline 架構已定義
- [ ] 建議 API 規格已完成（對應 api-design.md 格式）
- [ ] UI 互動模式已設計（含忽略/接受反饋機制）
- [ ] Cold Start 方案已確認
- [ ] 向量更新策略不會阻塞卡片儲存主流程

## 注意事項

- 即時建議（realtime）需設防抖（debounce 800ms），避免 API 過度呼叫
- 用戶「忽略」的建議需記錄，作為個人化訓練訊號
- MVP 可先用 BM25 關鍵字搜尋替代向量搜尋，驗證 UX 後再升級
- 建議面板不得遮擋主要編輯區，應為可收合的 overlay
