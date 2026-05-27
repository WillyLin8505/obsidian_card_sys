---
name: dev-plan
description: Generate a development plan with task breakdown and section 10 tracking tables
disable-model-invocation: true
allowed-tools: Read, Write, Glob, Grep
---

# 開發計畫書產生器

G0 通過後，由 L1 產出標準化開發計畫書。

## 使用方式
```
/dev-plan <sprint-number> <project-name>
```

## 參數
- `$0`: Sprint 編號
- `$1`: 專案名稱

## 執行步驟

1. 讀取對應的提案書：
!`cat proposal/sprint$0-proposal.md 2>/dev/null || echo "找不到 Sprint $0 提案書"`

2. 讀取開發計畫書範本：
!`cat .knowledge/company/templates/dev-plan.md.template 2>/dev/null || echo "範本未找到"`

3. **建立規範文件**（若不存在則建立，已存在則跳過）：

   > ⚠️ 規範文件是 Code Review「對規範」的比對對象，缺少 = Review 品質打折。
   > 必須在 dev-plan 產出時一併建立，不得延後。

   ```
   mkdir -p .knowledge/specs
   ```

   建立以下三個檔案（內容從提案書 + 技術方案提取）：

   | 檔案 | 內容 | 來源 |
   |------|------|------|
   | `.knowledge/specs/api-design.md` | API 端點清單、請求/回應格式、錯誤碼 | 提案書需求 + 技術方案 |
   | `.knowledge/specs/data-model.md` | 資料表定義、欄位型別、關聯、索引 | 技術方案 DB 設計 |
   | `.knowledge/specs/feature-spec.md` | 功能規格、用戶流程、邊界條件、驗收標準 | 提案書功能清單 |

   每個檔案格式：
   ```markdown
   # {標題}

   > 版本: v1.0 | Sprint {N} | 最後更新: {YYYY-MM-DD}

   ## 概述
   {簡述}

   ## 詳細規格
   {具體內容}
   ```

4. 產出 `proposal/sprint$0-dev-plan.md`，包含：
   - 需求摘要（來自提案書）
   - 技術方案
   - 檔案變更清單
   - 介面設計（如需要）
   - **第 5 節：規範文件索引**（指向 `.knowledge/specs/` 下的三個檔案）
   - **第 6 節：任務拆解表**（含依賴圖）
   - 驗收標準
   - 異常處理
   - 時程預估
   - **第 10 節：預建空表格**（任務完成紀錄 / Review 紀錄 / Gate 紀錄）

## 第 10 節格式（強制）

> ⚠️ 此區域的表頭名稱與欄位順序被系統 parser (`parseDevPlanSection10`) 嚴格依賴。
> 不得更改表頭名稱、欄位順序、或子標題名稱。

```markdown
## 10. 任務與審核紀錄（備查）

> 每個任務完成後記錄結果，每次 Review/Gate 通過後記錄決策。本區作為 Sprint 完整稽核軌跡。

### 任務完成紀錄

| 任務 | 完成日期 | 結果 | 備註 |
|------|---------|------|------|
| T1 | | | |
| T2 | | | |
（依第 6 節任務清單預建所有任務行）

### Review 紀錄

| Review 步驟 | 日期 | 結果 | Review 文件連結 |
|------------|------|------|---------------|
| UI 圖稿 Review | | | |
| 實作 Review | | | |
| 測試 Review | | | |
（依確認流程中的步驟預建行）

### Gate 紀錄

| Gate | 日期 | 決策 | 審核意見 |
|------|------|------|---------|
| G0 | | | |
| G1 | | | |
（依確認流程中的 Gate 預建行，空行 = 未審核）
```

### 欄位值規範（供後續 skill 填寫時遵守）

**任務結果欄位**（`normalizeStatus` 解析）：

| 值 | 系統狀態 |
|----|---------|
| `✅ 完成` | done |
| `🔧 需修正` | in_review |
| `🔄 進行中` | in_progress |

**Gate 決策欄位**（`decisionToStatus` 解析）：

| 值 | 系統狀態 |
|----|---------|
| `✅ 通過` | approved |
| `❌ 駁回` | rejected |
| `⚠️ 附條件通過` | approved |

**Review 結果欄位**：`通過` / `不通過`（目前僅存字串，不做狀態轉換）

**日期格式**：`YYYY-MM-DD`
