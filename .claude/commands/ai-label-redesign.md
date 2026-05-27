---
name: ai-label-redesign
description: Remove forced folder structure, replace with optional hierarchical labels backed by user research (SCAMPER-E strategy)
allowed-tools: Read, Write, Glob, Grep
---

# 移除強制資料夾 → 可選層級標籤

SCAMPER-E（刪除）策略實作：以用戶研究為依據，移除強制性資料夾結構，改為彈性的可選層級標籤系統。

## 使用方式
```
/ai-label-redesign [research|design|migrate]
```

## 參數
- `research`：產出用戶研究問卷與訪談大綱
- `design`：設計可選層級標籤系統
- `migrate`：規劃資料夾 → 標籤的遷移方案

## 五個為什麼提醒

> 根因：產品決策缺乏「刪除原則」，只有「新增原則」。
> 此 Skill 強制要求：刪除任何功能前，必須先有用戶研究數據支撐。

## ⚠️ 執行前置條件

**此 Skill 的 `design` 和 `migrate` 步驟，必須先完成 `research` 步驟並取得用戶研究結果。**
未完成用研即進行設計，屬於違規操作。

## 執行步驟

### Step A：用戶研究（`research` 模式）

#### A1. 設計用戶訪談題目

產出以下訪談問題（5 位用戶，各 30 分鐘）：

1. 你現在怎麼組織你的筆記？（開放式）
2. 資料夾對你來說最重要的功能是什麼？
3. 如果沒有資料夾，你最擔心什麼？
4. 你用標籤嗎？用幾個？為什麼停用/繼續用？
5. 給你一個系統：沒有資料夾，但可以加多個標籤且標籤有層級，你覺得能接受嗎？

#### A2. 定義刪除門檻

只有當以下數據達標，才能進行刪除設計：
- [ ] 用戶訪談：> 60% 受訪者表示資料夾非核心需求
- [ ] 使用數據：> 70% 的筆記放在根目錄或只有一層資料夾
- [ ] 替代接受度：> 50% 受訪者願意嘗試層級標籤替代資料夾

#### A3. 記錄用研結論

將結果寫入 `.knowledge/postmortem-log.md` 的「用戶研究記錄」章節。

---

### Step B：標籤系統設計（`design` 模式，需先完成 A）

#### B1. 可選層級標籤資料結構

```typescript
interface Tag {
  id: string
  name: string
  color?: string
  parent_tag_id?: string    // null = 頂層標籤
  children?: Tag[]
  usage_count: number       // 排序/建議用
}

interface Card {
  // ... 既有欄位
  tags: string[]            // tag IDs，多值
  // folder_id 欄位標記為 deprecated，遷移期保留
}
```

#### B2. 標籤系統規則

| 規則 | 說明 |
|------|------|
| 最大層級深度 | 3 層（避免層級資料夾化） |
| 單張卡片最多標籤數 | 10 個 |
| 標籤為可選 | 無標籤的卡片不應被隱藏 |
| AI 標籤建議 | 儲存時，AI 建議 2-3 個相關標籤 |

#### B3. UI 設計要求

- 標籤新增介面：inline 輸入 + 自動補全（不需要進入設定頁）
- 標籤篩選：多選 AND/OR 切換
- 無標籤卡片：在「全部卡片」視圖中仍可見，不能成為孤兒

---

### Step C：遷移方案（`migrate` 模式，需先完成 A+B）

#### C1. 資料夾 → 標籤自動轉換

```
資料夾路徑：/工作/2026/Q1
              ↓ 轉換
標籤：工作 > 2026 > Q1（保留層級關係）
```

#### C2. 遷移 API

```
POST /migration/folders-to-tags
Body: { user_id: string, dry_run: boolean }
Response: {
  cards_affected: number,
  folders_converted: Array<{ path, tag_id }>,
  conflicts: Array<{ description }>
}
```

#### C3. 遷移 UX 設計

- 遷移前：顯示預覽（不自動執行）
- 遷移中：進度條 + 可取消
- 遷移後：保留 30 天撤銷期

## 驗收標準

- [ ] 用戶研究數據已收集並達到刪除門檻
- [ ] 標籤資料結構設計已完成
- [ ] 遷移 API 規格已定義
- [ ] 遷移 UX 覆蓋所有狀態（乾跑預覽 / 執行中 / 完成 / 失敗）
- [ ] 無標籤卡片不會從系統中「消失」

## 注意事項

- 資料夾欄位刪除必須等遷移率 > 95% 後才能進行資料庫 migration
- 「刪除功能」操作是高風險操作，必須記錄在 `.knowledge/postmortem-log.md`
- 此功能上線前必須執行 `/pre-deploy` 完整清單
