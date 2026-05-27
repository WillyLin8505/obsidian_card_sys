---
name: ai-inbox-async
description: Design quick-capture Inbox + async organization workflow to eliminate collection-organize friction (SCAMPER-C strategy)
allowed-tools: Read, Write, Glob, Grep
---

# 快取收集 Inbox ＋ 異步整理工作流

SCAMPER-C（結合）策略實作：整合「快速捕捉」與「分階段整理」，消除兩者的摩擦斷點。

## 使用方式
```
/ai-inbox-async [design|spec|review]
```

## 參數
- `design`：產出 Inbox 功能設計文件
- `spec`：展開功能規格（對應 feature-spec.md）
- `review`：比對設計稿，確認 Inbox UI 狀態完整性

## 五個為什麼提醒

> 根因：工具未提供「漸進式整理」路徑，強迫用戶一次性完成。
> → 解法：Inbox 作為緩衝區，卡片可分階段完善（草稿 → 整理中 → 完成）。

## 卡片生命週期定義

```
[快速捕捉] → inbox（草稿）
     ↓（異步整理）
[加入連結]  → processing（整理中）
     ↓（完善內容）
[設定標籤]  → active（活躍）
     ↓（長期不更新）
[自動歸檔]  → archived（封存）
```

## 執行步驟

### 1. 確認現有卡片狀態欄位

讀取 `.knowledge/data-model.md`，確認是否有 `status` 或 `inbox` 相關欄位。

### 2. 設計 Inbox 資料結構

```typescript
type CardStatus = 'inbox' | 'processing' | 'active' | 'archived'

interface Card {
  // ... 既有欄位
  status: CardStatus
  inbox_captured_at?: string  // 快速捕捉時間戳
  last_reviewed_at?: string   // 最後整理時間
  completeness_score?: number // 0-100，AI 計算完整度
}
```

### 3. 設計 Inbox 快速捕捉 API

```
POST /cards/quick-capture
Body: { content: string, source?: 'mobile' | 'desktop' | 'extension' }
Response: { card_id, status: 'inbox' }
```

### 4. 設計異步整理觸發機制

確認以下觸發點：
- [ ] Inbox 卡片數量超過閾值（建議：> 20 張）→ 提示整理
- [ ] 定時提醒（每日 Inbox Review，參考 `/ai-spaced-repetition`）
- [ ] AI 自動建議連結（從 inbox 卡片觸發，參考 `/ai-link-suggest`）

### 5. 產出功能規格

寫入 `.knowledge/feature-spec.md` 的「Inbox 工作流」章節，包含：
- 用戶故事（3 條）
- UI 狀態清單（空 Inbox / 有待整理項目 / 整理中 / 清空完成）
- 驗收標準

## 驗收標準

- [ ] 快速捕捉可在 3 秒內完成（零整理摩擦）
- [ ] Inbox 卡片有明確的「下一步行動」引導
- [ ] 狀態轉換邏輯已定義（不得出現狀態孤兒）
- [ ] 與 `/ai-spaced-repetition` 的每日回顧流程整合點已確認

## 注意事項

- Inbox 不是垃圾桶：設計時需強調「每張 inbox 卡片都值得被整理」
- 快速捕捉 API 必須允許離線排隊（PWA 場景）
- `completeness_score` 為 AI 功能，MVP 可先以固定規則替代（有無連結、有無標籤）
