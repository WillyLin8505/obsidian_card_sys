# Obsidian Local Semantic Search

使用 LlamaIndex + BAAI/bge-m3 + Ollama qwen2.5 對 Obsidian vault 做本地語義搜尋。

## Setup

```bash
cd llama-search
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Pull Ollama Model

```bash
ollama pull qwen2.5
```

## 建立 Index

```bash
python build_index.py
```

- 讀取 `VAULT_DIR` 下所有 `.md` 檔
- 建立 vector index 並存到 `./storage`
- 若 `./storage` 已存在會自動清除重建

## 查詢

```bash
python query_index.py
```

輸入問題後按 Enter，輸入 `exit` 或 `quit` 離開。

## 自動監控（watchdog）

新增/修改/刪除 `.md` 檔時自動更新索引，不需要手動重建：

```bash
python watch_index.py
```

- 監控 `VAULT_DIR` 下所有子資料夾
- 檔案變動後 2 秒才觸發（debounce，避免連續存檔重複執行）
- 支援：新增、修改、刪除、重新命名
- Ctrl+C 停止

## 設定

修改 `build_index.py` 與 `watch_index.py` 中的：

```python
VAULT_DIR = "/mnt/d/obsidian/personal_willy"  # 改成你的 vault 路徑
```
