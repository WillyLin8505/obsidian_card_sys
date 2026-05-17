import sys
from pathlib import Path

from llama_index.core import StorageContext, load_index_from_storage, Settings
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.ollama import Ollama

# ── 可修改的常數 ──────────────────────────────────────────────
PERSIST_DIR = "./storage"
EMBED_MODEL = "BAAI/bge-m3"
LLM_MODEL = "qwen2.5"
SIMILARITY_TOP_K = 5
# ──────────────────────────────────────────────────────────────


def main() -> None:
    if not Path(PERSIST_DIR).exists():
        print(f"[ERROR] 找不到 index 目錄 {PERSIST_DIR}，請先執行 build_index.py")
        sys.exit(1)

    print(f"[INFO] 載入 embedding model: {EMBED_MODEL}")
    Settings.embed_model = HuggingFaceEmbedding(model_name=EMBED_MODEL)
    Settings.llm = Ollama(model=LLM_MODEL, request_timeout=120.0)

    storage_context = StorageContext.from_defaults(persist_dir=PERSIST_DIR)
    index = load_index_from_storage(storage_context)
    query_engine = index.as_query_engine(similarity_top_k=SIMILARITY_TOP_K)

    print("[INFO] Index 載入完成，輸入問題開始查詢（輸入 exit 離開）\n")

    while True:
        try:
            q = input("Question> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye!")
            break

        if not q or q.lower() in {"exit", "quit"}:
            break

        response = query_engine.query(q)

        print("\n=== Answer ===")
        print(str(response))

        print(f"\n=== Source Nodes (top {SIMILARITY_TOP_K}) ===")
        for i, node in enumerate(response.source_nodes, 1):
            src = node.metadata.get("file_name", "unknown")
            print(f"\n── [{i}] {src}  (score: {node.score:.4f}) ──")
            print(node.text[:1200])

        print()


if __name__ == "__main__":
    main()
