import sys
import time
from pathlib import Path
import shutil

from llama_index.core import SimpleDirectoryReader, VectorStoreIndex, Settings
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.ollama import Ollama

# ── 可修改的常數 ──────────────────────────────────────────────
VAULT_DIR = "/path/to/obsidian/vault"
PERSIST_DIR = "./storage"
EMBED_MODEL = "BAAI/bge-m3"
LLM_MODEL = "qwen2.5"
# ──────────────────────────────────────────────────────────────


def main() -> None:
    vault = Path(VAULT_DIR)
    if not vault.exists():
        print(f"[ERROR] Vault 路徑不存在: {VAULT_DIR}")
        sys.exit(1)

    persist_path = Path(PERSIST_DIR)
    if persist_path.exists():
        print(f"[INFO] 偵測到舊 index，刪除 {PERSIST_DIR} 並重建…")
        shutil.rmtree(persist_path)

    print(f"[INFO] 載入 embedding model: {EMBED_MODEL}")
    Settings.embed_model = HuggingFaceEmbedding(model_name=EMBED_MODEL)
    Settings.llm = Ollama(model=LLM_MODEL, request_timeout=120.0)

    print(f"[INFO] 掃描 Vault: {VAULT_DIR}")
    documents = SimpleDirectoryReader(
        input_dir=VAULT_DIR,
        recursive=True,
        required_exts=[".md"],
    ).load_data()

    if not documents:
        print("[WARN] 未找到任何 .md 檔案，請確認 VAULT_DIR 路徑。")
        sys.exit(1)

    print(f"[INFO] 讀取到 {len(documents)} 份文件，開始建立 index…")
    t0 = time.time()
    index = VectorStoreIndex.from_documents(documents, show_progress=True)
    elapsed = time.time() - t0

    index.storage_context.persist(persist_dir=PERSIST_DIR)
    print(f"[DONE] Index 已儲存至 {PERSIST_DIR}（耗時 {elapsed:.1f}s）")


if __name__ == "__main__":
    main()
