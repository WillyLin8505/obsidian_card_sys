#!/usr/bin/env python3
"""單一筆記增量更新索引（與 build_index.py 使用相同的 chunk 策略）。"""
import re
import sys
from pathlib import Path

from llama_index.core import (
    StorageContext,
    load_index_from_storage,
    SimpleDirectoryReader,
    Settings,
    Document,
)
from llama_index.core.node_parser import SentenceSplitter
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.core.llms import MockLLM

PERSIST_DIR = Path(__file__).parent / "storage"
CHUNK_SIZE = 512
CHUNK_OVERLAP = 64


def extract_title(text: str, filename: str) -> str:
    m = re.search(
        r"^---\n.*?^(?:title|abstract):\s*(.+?)$.*?^---",
        text,
        re.MULTILINE | re.DOTALL,
    )
    if m:
        return m.group(1).strip().strip('"\'')
    return Path(filename).stem


def main():
    if len(sys.argv) < 2:
        print("Usage: update_one.py <absolute_file_path>", file=sys.stderr)
        sys.exit(1)

    path = sys.argv[1]
    if not Path(path).exists():
        print(f"File not found: {path}", file=sys.stderr)
        sys.exit(1)

    Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-m3", device="cuda")
    Settings.llm = MockLLM()
    Settings.node_parser = SentenceSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separator="\n\n",
    )

    storage_context = StorageContext.from_defaults(persist_dir=str(PERSIST_DIR))
    index = load_index_from_storage(storage_context)

    try:
        index.delete_ref_doc(path, delete_from_docstore=True)
    except Exception:
        pass

    docs = SimpleDirectoryReader(input_files=[path]).load_data()
    for doc in docs:
        title = extract_title(doc.text, doc.metadata.get("file_name", ""))
        prefix = f"標題：{title}\n\n"
        new_text = prefix + doc.text if title and not doc.text.startswith(prefix) else doc.text
        new_doc = Document(text=new_text, metadata=doc.metadata, doc_id=path)
        index.insert(new_doc)

    index.storage_context.persist(persist_dir=str(PERSIST_DIR))
    print(f"[+] Indexed: {Path(path).name}")


if __name__ == "__main__":
    main()
