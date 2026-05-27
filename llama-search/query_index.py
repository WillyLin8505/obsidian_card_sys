from llama_index.core import StorageContext, load_index_from_storage, Settings
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.ollama import Ollama

PERSIST_DIR = "./storage"

def main():
    Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-m3", device="cuda")
    Settings.llm = Ollama(model="qwen2.5", request_timeout=120.0)

    storage_context = StorageContext.from_defaults(persist_dir=PERSIST_DIR)
    index = load_index_from_storage(storage_context)

    query_engine = index.as_query_engine(similarity_top_k=5)

    while True:
        q = input("\nQuestion> ").strip()
        if q.lower() in {"exit", "quit"}:
            break

        response = query_engine.query(q)
        print("\n=== Answer ===")
        print(str(response))

        print("\n=== Source Nodes ===")
        for i, node in enumerate(response.source_nodes, 1):
            print(f"\n[{i}] score={node.score}")
            print(node.text[:1200])

if __name__ == "__main__":
    main()
