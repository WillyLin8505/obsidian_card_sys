---
name: ai-onboarding
description: Redesign onboarding flow starting from questions instead of blank page to achieve Day-1 aha moment (SCAMPER-R strategy)
allowed-tools: Read, Write, Glob, Grep
---

# 逆向 Onboarding 設計：從問題開始，而非空白頁

SCAMPER-R（逆向）策略實作：逆向設計 onboarding 流程，先定義「用戶第一個 aha moment」，再往前推所有引導步驟。

## 使用方式
```
/ai-onboarding [map|design|test]
```

## 參數
- `map`：逆向映射 aha moment 到第一步驟
- `design`：產出完整 onboarding 流程設計
- `test`：定義 A/B 測試方案（空白頁 vs 問題引導）

## 五個為什麼提醒

> 根因：工具設計從「產品視角」出發，沒有逆向從「用戶的第一個成功時刻」出發。
> → 解法：先定義 Day-1 aha moment，再反推所有引導步驟。

## Aha Moment 定義

> **目標 aha moment**：
> 用戶在 10 分鐘內建立第一張卡片，並看到它與另一張卡片產生連結，
> 感受到「這系統懂我在想什麼」。

## 逆向映射

```
[Aha Moment] 看到第一個 AI 連結建議被接受
      ↑ 需要
[Step 4] 有 2 張以上的卡片，內容有語義關聯
      ↑ 需要
[Step 3] 建立第 2 張卡片（AI 引導主題）
      ↑ 需要
[Step 2] 建立第 1 張卡片（從問題回答自然產生）
      ↑ 需要
[Step 1] 系統問用戶一個有趣的問題，而非顯示空白頁
      ↑ 需要
[入口] 用戶完成帳號建立，進入首頁
```

## 執行步驟

### 1. 定義開場問題庫（`map` 模式）

設計 10 個高品質開場問題，依用戶類型分類：

**知識工作者**
- 「你最近在深度研究什麼主題？花 1 分鐘寫下核心概念。」
- 「上週你學到最有價值的一件事是什麼？」

**學生**
- 「你現在最想弄清楚的一個學科概念是什麼？」
- 「寫下這學期讓你最困惑的一個問題。」

**創作者**
- 「你正在進行什麼創作計畫？列出 3 個核心元素。」
- 「你最近的一個靈感是什麼？從哪裡來的？」

**選題標準**：問題必須能在 3 分鐘內回答，且答案天然包含可連結的概念。

### 2. 設計 Onboarding 流程（`design` 模式）

```
畫面 1: 歡迎 + 選擇身份
  └→ 4 個身份卡片（知識工作者 / 學生 / 研究者 / 創作者）

畫面 2: 開場問題（根據身份選擇）
  └→ 大文字輸入框 + 提示語
  └→ [開始思考] 按鈕

畫面 3: 第一張卡片自動生成
  └→ 系統將回答拆解為 2-3 張草稿卡片
  └→ 用戶確認/編輯

畫面 4: 第二個問題（延伸）
  └→ AI 根據第一張卡片內容，提出延伸問題
  └→ 引導建立第 2 張卡片

畫面 5: Aha Moment！
  └→ 顯示「這兩張卡片可能有關聯」的 AI 建議
  └→ 用戶接受連結 → 看到第一個知識圖譜
  └→ 成就提示：「你的知識圖譜已啟動」

畫面 6: 引導繼續
  └→ 每日回顧設定（推薦 09:00）
  └→ 瀏覽器擴充套件安裝（可選）
  └→ 進入主介面
```

### 3. 設計 Onboarding API

```
POST /onboarding/start
Body: { user_type: 'knowledge_worker' | 'student' | 'researcher' | 'creator' }
Response: { question: string, question_id: string }

POST /onboarding/answer
Body: { question_id: string, answer: string }
Response: {
  draft_cards: Array<{ title, content }>,
  suggested_next_question: string
}

POST /onboarding/complete
Body: { user_id: string }
Response: { onboarding_completed: true }
```

### 4. A/B 測試方案（`test` 模式）

| | 控制組（A） | 實驗組（B） |
|--|------------|------------|
| 首頁 | 空白筆記本 | 開場問題引導 |
| 衡量指標 | Day-1 卡片建立率 | Day-1 卡片建立率 |
| 次要指標 | Day-7 留存率、卡片連結數 | Day-7 留存率、卡片連結數 |
| 樣本大小 | 各 200 新用戶 | 各 200 新用戶 |
| 成功門檻 | B 組 Day-1 建立率提升 > 30% | — |

### 5. 產出設計文件

寫入 `.knowledge/feature-spec.md` 的「Onboarding 流程」章節：
- 完整 6 畫面流程文字稿
- API 規格
- A/B 測試計畫

## 驗收標準

- [ ] 開場問題庫已建立（至少 8 題，涵蓋 4 種用戶類型）
- [ ] 6 畫面 onboarding 流程已設計完整
- [ ] 每個畫面都有明確的「用戶完成動作」定義
- [ ] Aha Moment 觸發條件已定義（可量化）
- [ ] A/B 測試計畫已完成（含成功門檻）

## 注意事項

- Onboarding 是 Sprint 1 最高優先任務，直接影響新用戶留存
- 開場問題不得超過 1 個（多問題會造成用戶放棄）
- 「跳過」按鈕必須存在，但位置應設計為次要（灰色小字）
- Onboarding 完成率目標 > 70%，低於此值需即時調整
- 此 Skill 完成後需配合 `/review` 進行 UX 設計審查
