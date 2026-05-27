---
name: review
description: L1 internal review with auto-detection, design comparison, and Gate escalation path
disable-model-invocation: true
allowed-tools: Read, Edit, Glob, Grep, Bash
---

# L1 內部 Review

執行內部 Review checklist 並記錄到開發計畫書第 10 節。支援自動偵測步驟類型。

## 使用方式
```
/review [review-type] [target]
```

## 參數
- `$0`: Review 類型（auto / code / spec / design / function）
- `$ARGUMENTS`: 完整參數
- 若 `$0` 為 `auto` 或省略，自動偵測當前步驟

## 步驟自動偵測

當 review-type 為 `auto` 或未指定時：

1. 讀取 `proposal/sprint*-dev-plan.md`（最新的開發計畫書）
2. 找到第 10 節「執行紀錄」中最近完成的任務
3. 根據任務類型判斷步驟：
   - 含 `design` / `架構` / `API 設計` → 步驟 = 設計 → Review: 對規範
   - 含 `mockup` / `UI` / `圖稿` → 步驟 = UI 圖稿 → Review: 對設計稿
   - 含 `backend` / `API` / `route` / `service` → 步驟 = 實作（後端）→ Review: 對程式碼 + 對規範
   - 含 `frontend` / `component` / `view` / `page` → 步驟 = 實作（前端）→ Review: 對程式碼 + 對設計稿 + 對規範
   - 含 `test` / `e2e` / `spec` → 步驟 = 測試 → Review: 對功能 + 對規範
   - 含 `doc` / `文件` → 步驟 = 文件 → Review: 對規範
4. 輸出偵測結果，確認後執行

## Review Checklist

### 對程式碼（code）
- [ ] 無 bug 或邏輯錯誤
- [ ] 錯誤處理完整（外部呼叫有 try-catch）
- [ ] 無硬編碼機密資訊
- [ ] 命名有意義且符合規範（snake/camel/Pascal 分層）
- [ ] 無死碼（註解掉的程式碼、未使用的 import）
- [ ] 單一職責原則
- [ ] TypeScript 型別正確（無 any）
- [ ] 文件已同步更新（.knowledge/ + CLAUDE.md 索引）

### 對規範（spec）
- [ ] 實作與 API 規範文件一致（api-design.md）
- [ ] 實作與 data model 文件一致（data-model.md）
- [ ] 實作與 feature spec 一致（feature-spec.md）
- [ ] 命名轉換正確（DB snake → API snake → 前端 camel）

### 對設計稿（design）
- [ ] 佈局結構一致（元件位置、大小、間距）
- [ ] 色彩一致（使用設計稿色系，未自行選色）
- [ ] 動畫一致（時長、easing 與設計稿規格相符）
- [ ] 狀態切換完整（設計稿定義的每個 UI 狀態都已實作）
- [ ] 響應式一致（桌面版和手機版都與設計稿一致）
- [ ] 文案一致（按鈕文字、placeholder、空狀態文案）

> **L1 比對方式**：同時開啟設計稿 HTML/截圖和實際畫面，逐項確認。UI 不一致 = Blocker。

### 對功能（function）
- [ ] 端到端功能正常
- [ ] 效能達標
- [ ] 驗收標準全部滿足
- [ ] 無 Critical/High 等級 Bug

### 對文件正確性（doc-integrity）

> 檢查 dev-plan 和 .tasks/ 檔案的格式與內容一致性。
> **觸發時機**：每次 `/review` 時自動附加執行，不需手動指定。

#### dev-plan 檢查
- [ ] 第 10 節存在且包含三個子表格（任務完成紀錄、Review 紀錄、Gate 紀錄）
- [ ] Gate 紀錄的決策值符合規範（`✅ 通過` / `❌ 駁回` / `⚠️ 附條件通過`，不可用純文字或英文）
- [ ] 日期格式為 `YYYY-MM-DD`
- [ ] 第 6 節任務表與 `.tasks/` 目錄的任務數量一致

#### task 文件檢查（逐一掃描 `.tasks/sprint-{N}/*.md`）
- [ ] metadata 表必要欄位齊全：ID、狀態、Sprint、建立時間、開始時間、完工時間
- [ ] 狀態值為合法英文值（created / assigned / in_progress / in_review / done / blocked / rejected）
- [ ] 事件紀錄區塊（`## 事件紀錄`）存在且至少有一筆紀錄
- [ ] 事件紀錄 timestamp 格式為 ISO 8601（`YYYY-MM-DDTHH:mm:ss.sssZ`）
- [ ] 狀態為 `done` 的任務，驗收標準全部打勾（`- [x]`，無殘留 `- [ ]`）
- [ ] 狀態為 `in_progress` 以上的任務，`開始時間` 不得為 `—`
- [ ] 狀態為 `done` / `in_review` 的任務，`完工時間` 不得為 `—`

## 執行步驟

1. 偵測或確認 review type（若為 auto 則執行自動偵測）
2. 根據步驟類型選擇 review 組合（可能多種）
3. **自動附加「對文件正確性」檢查** — 每次 review 必定執行 doc-integrity checklist
4. 逐項檢查每個 checklist，標記 ✅ 或 ❌ 並說明
5. 統計結果：
   - 🔴 Blocker: {count}
   - 🟠 Major: {count}
   - 🟡 Minor: {count}
6. 判定：0 Blocker + 0 Major = 通過

## 結果記錄

在 dev-plan 第 10 節「Review 紀錄」表格，找到對應步驟行並更新：

### 格式規範（系統解析依賴）

| 欄位 | 格式 | 說明 |
|------|------|------|
| Review 步驟 | 自由文字 | 如「UI 圖稿 Review」「實作 Review」 |
| 日期 | `YYYY-MM-DD` | 如 `2026-03-27` |
| 結果 | `通過` 或 `不通過` | **嚴格使用這兩個值** |
| Review 文件連結 | 自由文字 | `Blocker:{n} Major:{n} Minor:{n} — {摘要}` |

```
| {步驟名} Review | {YYYY-MM-DD} | {通過/不通過} | Blocker:{n} Major:{n} Minor:{n} — {摘要} |
```

## Gate 升級路徑

Review 通過後，建議下一步：

| 完成的步驟 | 建議提交 | 指令 |
|-----------|---------|------|
| 設計 | — | 進入下一步驟 |
| UI 圖稿 | G1 圖稿審核 | /gate-record G1 |
| 實作（後端/前端） | G2 程式碼審查 | /gate-record G2 |
| 測試 | G3 測試驗收 | /gate-record G3 |
| 文件 | G4 文件審查 | /gate-record G4 |

> 提交前確認：前置 Gate 已通過、開發計畫書第 10 節已記錄。
