---
name: source-note-summary
description: 將文章提煉成文獻筆記：用第一性原理萃取核心觀點並補充實例，輸出符合本專案「文獻筆記」模板格式的 Markdown
allowed-tools: Read, Bash, WebFetch
---

# 文章摘要 → 文獻筆記

將輸入的文章內容，以「Core Insight & Practical Applicator」規則提煉，輸出符合本專案「文獻筆記」設定模板的完整 Markdown 筆記。

## 使用方式

```
/source-note-summary <文章文字>
/source-note-summary --file <檔案路徑>
/source-note-summary --url <網址>
```

---

## 執行步驟

### Step 1 — 解析輸入

解析 `$ARGUMENTS`：

| 格式 | 行為 |
|------|------|
| `--file <path>` | 用 Read 工具讀取該路徑的檔案內容 |
| `--url <url>` | 用 WebFetch 工具抓取網頁正文 |
| 純文字 | 直接作為文章內容 |

若輸入為空，停止並提示：「請提供文章文字、`--file <路徑>` 或 `--url <網址>`。」

---

### Step 2 — 讀取文獻筆記模板

執行以下指令，讀取目前專案的文獻筆記模板定義：

```bash
grep -A 30 "sourceNoteTemplate:" /home/sssss/Card_Box_Note_Management/src/app/utils/storage.ts | head -35
```

從輸出中提取兩個部分：

1. **`metadataFields`**：YAML frontmatter 的欄位名稱與預設值（`key` / `defaultValue`）
2. **`bodyTemplate`**：正文的 Markdown 結構（各 `##` 區段標題與佔位內容）

這兩部分決定最終輸出的完整格式。

---

### Step 3 — 提煉文章內容

對 Step 1 取得的文章套用以下規則，**全程輸出繁體中文**：

#### Distillation（萃取）
- 只保留「第一性原理」層級的核心觀點
- 去除原文範例、形容詞、填充詞、重複句
- 以簡潔的層級 bullet 結構呈現，**加粗關鍵術語**

#### Supplementation（補充實例）
- 每個核心觀點補充 **2–3 個原創的高頻現實情境範例**
- 每個範例嚴格使用 `情境 + 行動/對話` 框架：
  - **情境**：描述一個具體的日常或職場場景
  - **行動/對話**：描述具體的行為或可說出的話語

#### 格式約束
- 無表情符號
- 無開場白、結語、過渡句
- 各核心觀點之間用 `---` 分隔
- 使用 Markdown 加粗關鍵術語

#### 反思（Personal Reflection）
- 最後產出 2–3 句整合性反思
- 說明這些核心觀點如何組成一個更大的心智模型或長期習慣
- 語氣直接，不抒情

---

### Step 4 — 組裝文獻筆記

依 Step 2 讀到的模板，組裝完整 Markdown，**不得新增模板以外的區段**：

#### YAML Frontmatter
依 `metadataFields` 的順序逐欄填入：
- `create date` → 今日日期，格式 `YYYY-MM-DD`
- `aliases` → 文章標題的簡短別名（英文或中文皆可，可留空）
- `tags` → 使用模板的 `defaultValue`（不修改）
- 其他欄位 → 使用模板的 `defaultValue`

#### 正文各區段
依 `bodyTemplate` 的區段順序填入，**區段標題保持原樣**：

| bodyTemplate 區段 | 填入內容 |
|-------------------|---------|
| `## 來源資訊` | 從文章或 URL 萃取：作者、標題、原始連結；找不到的欄位留空 |
| `## 重點摘要` | Step 3 的 Core Summary（萃取觀點 + 補充實例，含 `---` 分隔） |
| `## 個人想法` | Step 3 的 Personal Reflection（2–3 句整合反思） |

若 `bodyTemplate` 含有其他自訂區段，依同樣方式對應填入。

---

### Step 5 — 輸出

直接輸出完整的 Markdown 文獻筆記，格式如下（以預設模板為例）：

```markdown
---
create date: YYYY-MM-DD
aliases: 
tags:
  - 3card/筆記法/卡片盒筆記法/文獻筆記
---

# 文獻筆記

## 來源資訊
- 作者：
- 標題：
- 連結：

## 重點摘要

[Core Summary 萃取結果]

---

[每個核心觀點 + 補充實例]

## 個人想法

[Personal Reflection]
```

輸出後提示：「可直接複製貼入 Obsidian，或使用 `/source-note-summary --url` 搭配文獻筆記頁面的網址輸入欄自動建立筆記。」
