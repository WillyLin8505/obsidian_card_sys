---
name: semantic-search
description: 語義搜尋：給定檔案或文字，使用 LlamaIndex + BGE-M3 + RAG 模糊語義搜尋，回傳相關結果與 Top 3 關鍵字
allowed-tools: Read, Bash
---

# 語義搜尋（Semantic Search）

使用 LlamaIndex RAG 架構（BGE-M3 embedding + Qwen2.5 LLM）對知識庫進行語義搜尋，並從結果中萃取 **3 個最相關關鍵字**。

## 使用方式

```
/semantic-search <查詢文字>
/semantic-search --file <檔案路徑>
```

### 範例
```
/semantic-search 專案管理與任務追蹤
/semantic-search --file /mnt/d/obsidian/Willy_2026/meeting-notes.md
```

## 參數

- `$ARGUMENTS`：查詢文字，**或** `--file <路徑>` 指定來源檔案

## 執行步驟

### Step 1 — 解析輸入

判斷 `$ARGUMENTS` 的格式：

| 格式 | 行為 |
|------|------|
| `--file <path>` | 讀取該檔案內容作為查詢 |
| `--file` 開頭但缺路徑 | 請用戶補上路徑 |
| 一般文字 | 直接作為查詢文字 |

若輸入為空，提示：「請提供查詢文字或使用 `--file <路徑>` 指定檔案。」

### Step 2 — 確認索引存在

```bash
ls llama-search/storage/
```

- 若 `storage/` 不存在或為空 → 提示用戶先執行：
  ```bash
  cd llama-search && python build_index.py
  ```
  並停止執行。

### Step 3 — 執行語義搜尋

```bash
cd llama-search && python semantic_search.py $ARGUMENTS
```

### Step 4 — 解讀並呈現結果

將腳本輸出整理成以下格式：

---

## 搜尋結果摘要

**查詢**：`{query}`

### RAG 回答
{LLM 整合回答}

### 相關來源（Top N）

| # | 相似度分數 | 內容摘要 |
|---|-----------|---------|
| 1 | {score} | {excerpt} |

### Top 3 最相關關鍵字

1. `{keyword_1}`
2. `{keyword_2}`
3. `{keyword_3}`

---

### Step 5 — 後續建議（選用）

若用戶想深入某個關鍵字，建議：
```
/semantic-search {keyword_1}
```

## 錯誤處理

| 錯誤 | 原因 | 處理 |
|------|------|------|
| `索引不存在` | storage/ 目錄缺失 | 提示執行 `build_index.py` |
| `找不到檔案` | 路徑錯誤 | 請用戶確認路徑 |
| `CUDA 不可用` | GPU 環境問題 | 修改 `semantic_search.py` 中 `device="cpu"` |
| `Ollama 連線失敗` | Ollama 服務未啟動 | 提示執行 `ollama serve` |

## 相關腳本

| 腳本 | 用途 |
|------|------|
| `llama-search/build_index.py` | 建立/重建知識庫索引 |
| `llama-search/watch_index.py` | 監聽檔案變更，自動更新索引 |
| `llama-search/query_index.py` | 互動式問答（CLI） |
| `llama-search/semantic_search.py` | 本指令呼叫的語義搜尋腳本 |
