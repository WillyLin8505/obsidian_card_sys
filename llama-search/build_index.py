"""
重建語義搜尋索引（全量）

優化：
  - CUDA 加速 embedding
  - chunk_size=512（更細粒度，適合 Zettelkasten 短筆記）
  - 段落邊界切割，標題資訊嵌入 chunk 開頭
"""
import re
import shutil
from pathlib import Path

from llama_index.core import SimpleDirectoryReader, VectorStoreIndex, Settings, Document
from llama_index.core.node_parser import SentenceSplitter
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.core.llms import MockLLM

VAULT_DIR = "/mnt/d/obsidian/personal_willy"
PERSIST_DIR = "./storage"
CHUNK_SIZE = 512
CHUNK_OVERLAP = 64


def extract_title(text: str, filename: str) -> str:
    """從 frontmatter 取 title，找不到就用檔名。"""
    m = re.search(
        r"^---\n.*?^(?:title|abstract):\s*(.+?)$.*?^---",
        text,
        re.MULTILINE | re.DOTALL,
    )
    if m:
        return m.group(1).strip().strip('"\'')
    return Path(filename).stem


def prepend_title(documents: list) -> list:
    """在每份文件的正文開頭加上標題，讓 embedding 包含標題語意。"""
    result = []
    for doc in documents:
        filename = doc.metadata.get("file_name", "")
        title = extract_title(doc.text, filename)
        prefix = f"標題：{title}\n\n"
        new_text = prefix + doc.text if title and not doc.text.startswith(prefix) else doc.text
        result.append(Document(text=new_text, metadata=doc.metadata, doc_id=doc.doc_id))
    return result


def main():
    persist_path = Path(PERSIST_DIR)
    if persist_path.exists():
        shutil.rmtree(persist_path)

    Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-m3", device="cuda")
    Settings.llm = MockLLM()
    Settings.node_parser = SentenceSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separator="\n\n",
    )

    md_files = [p for p in Path(VAULT_DIR).rglob("*.md") if p.is_file()]
    print(f"Found {len(md_files)} markdown files")

    documents = SimpleDirectoryReader(input_files=md_files).load_data()
    documents = prepend_title(documents)

    index = VectorStoreIndex.from_documents(documents, show_progress=True)
    index.storage_context.persist(persist_dir=PERSIST_DIR)

    print(f"Indexed {len(documents)} docs → {PERSIST_DIR}")


if __name__ == "__main__":
    main()
