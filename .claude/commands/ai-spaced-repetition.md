---
name: ai-spaced-repetition
description: Design and implement spaced repetition daily review system to surface forgotten cards (SCAMPER-A strategy)
allowed-tools: Read, Write, Glob, Grep
---

# 間隔重複回顧（Spaced Repetition Daily Review）

SCAMPER-A（改編）策略實作：從學習科學移植間隔重複演算法，設計「每日回顧」機制，讓系統主動觸發知識重訪。

## 使用方式
```
/ai-spaced-repetition [design|algorithm|integrate]
```

## 參數
- `design`：產出每日回顧 UX 設計文件
- `algorithm`：定義間隔重複排程演算法
- `integrate`：確認與 Inbox 工作流的整合介面

## 五個為什麼提醒

> 根因：知識工具的設計隱喻是「倉庫」而非「對話夥伴」。
> → 解法：間隔重複讓系統從被動儲存轉為主動提醒。

## 演算法選型

| 演算法 | 適用場景 | 建議 |
|--------|---------|------|
| SM-2（SuperMemo） | 記憶卡片、單字 | 過於學術，不適合筆記 |
| FSRS（最新研究） | 高精度記憶 | 複雜，冷啟動困難 |
| **簡化衰減模型** | 一般知識筆記 | **MVP 首選** |

### 簡化衰減模型規則

```
初次建立卡片   → 第 1 天回顧
回顧後標記「熟悉」 → 間隔 × 2.5（1 → 3 → 7 → 17 → 43 天...）
回顧後標記「陌生」 → 間隔重置為 1 天
回顧後標記「略知」 → 間隔 × 1.2
```

## 執行步驟

### 1. 確認卡片時間欄位

讀取 `.knowledge/data-model.md`，確認：
- `created_at`、`updated_at` 是否存在
- 是否有 `next_review_at` 欄位

### 2. 設計回顧資料結構

```typescript
interface CardReviewRecord {
  card_id: string
  reviewed_at: string
  familiarity: 'unknown' | 'vague' | 'familiar'
  next_review_at: string   // 系統計算下次回顧時間
  review_interval_days: number
  review_count: number
}
```

### 3. 設計每日回顧 API

```
GET  /review/daily            → 取得今日應回顧的卡片清單
POST /review/:card_id/respond → 提交回顧結果（familiarity）
GET  /review/stats            → 回顧統計（連續天數、今日完成率）
```

### 4. 設計每日回顧 UX 流程

```
進入每日回顧
  ↓
顯示今日待回顧卡片數（X 張）
  ↓
逐張翻閱 → 用戶評分（不熟 / 略知 / 熟悉）
  ↓
完成後顯示成就畫面（連續天數 streak）
  ↓
新卡片建議：根據回顧中「不熟」的卡片，AI 推薦相關卡片
```

### 5. 整合 Inbox 工作流

確認與 `/ai-inbox-async` 的整合：
- [ ] Inbox 卡片首次整理完成後，自動加入回顧佇列
- [ ] 每日回顧入口與 Inbox 整理入口是否合併為「每日任務」頁

### 6. 產出設計文件

寫入 `.knowledge/feature-spec.md` 的「每日回顧」章節。

## 驗收標準

- [ ] 間隔重複演算法已定義（附公式）
- [ ] 每日回顧 API 設計完成
- [ ] UX 流程覆蓋所有狀態（無待回顧 / 有待回顧 / 回顧完成）
- [ ] 與 `/ai-inbox-async` 整合點已確認

## 注意事項

- MVP 階段每日回顧上限建議設為 20 張，避免用戶感到壓力
- Streak 功能是重要的激勵機制，不可省略
- 回顧資料是未來 AI 個人化的基礎，必須完整記錄（即使 MVP 暫不使用）
