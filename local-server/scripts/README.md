# Obsidian 本地語義搜尋（LlamaIndex + BGE-M3 + Qwen2.5）

以 LlamaIndex 為框架，使用 `BAAI/bge-m3` 做 embedding、`qwen2.5`（透過 Ollama）做 LLM，
對 Obsidian Vault 中的 `.md` 筆記建立向量索引，並提供 CLI 語義查詢。

---

## 1. 建立虛擬環境

```bash
# Linux / WSL
python3 -m venv .venv
source .venv/bin/activate

# Windows PowerShell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

## 2. 安裝相依套件

```bash
pip install -r requirements.txt
```

> 首次安裝 `torch` 與 `sentence-transformers` 會比較久，請耐心等候。

## 3. 安裝 / 啟動 Ollama 並拉取模型

```bash
# 安裝 Ollama（參考 https://ollama.com）
# 拉取 qwen2.5 模型
ollama pull qwen2.5

# 確認模型可用
ollama list
```

## 4. 設定 Vault 路徑

開啟 `build_index.py`，將 `VAULT_DIR` 改為你的 Obsidian Vault 絕對路徑：

```python
VAULT_DIR = "/home/user/ObsidianVault"   # Linux / WSL 範例
```

## 5. 建立 Index

```bash
python build_index.py
```

完成後會在 `./storage/` 目錄產生持久化的向量索引。
若 `./storage` 已存在，程式會自動刪除後重建。

## 6. 查詢

```bash
python query_index.py
```

進入互動式 CLI，輸入問題即可查詢，回覆會附上最相似的 5 個來源片段。
輸入 `exit` 或 `quit` 離開。

---

## 技術組合

| 元件 | 選用 |
|------|------|
| Embedding | `BAAI/bge-m3`（HuggingFace） |
| LLM | `qwen2.5`（Ollama 本地推論） |
| Framework | LlamaIndex |
| 向量儲存 | 本地檔案（`./storage`） |

## 執行順序速查

```
1. 建立 & 啟動 venv
2. pip install -r requirements.txt
3. ollama pull qwen2.5
4. 修改 VAULT_DIR
5. python build_index.py
6. python query_index.py
```
