#!/usr/bin/env python3
"""
llama-search vector search script.
Reads JSON from stdin: { "query": str, "top_k": int }
Outputs JSON to stdout: { "chunks": [...] }
Uses llama_index with BAAI/bge-m3 embeddings on GPU.
"""
import sys
import json
import os

STORAGE_DIR = os.path.join(
    os.path.dirname(__file__),
    '..', '..', 'llama-search', 'storage'
)


def main():
    data = json.load(sys.stdin)
    query = data.get('query', '').strip()
    top_k = int(data.get('top_k', 5))

    if not query:
        print(json.dumps({'chunks': [], 'error': 'query is required'}))
        sys.exit(1)

    from llama_index.core import StorageContext, load_index_from_storage, Settings
    from llama_index.embeddings.huggingface import HuggingFaceEmbedding

    Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-m3", device="cuda")
    Settings.llm = None

    storage_context = StorageContext.from_defaults(persist_dir=STORAGE_DIR)
    index = load_index_from_storage(storage_context)
    retriever = index.as_retriever(similarity_top_k=top_k)

    nodes = retriever.retrieve(query)

    chunks = []
    for node in nodes:
        meta = node.node.metadata or {}
        file_path = meta.get('file_path', '')

        # Extract relative path (strip vault prefix)
        note_path = file_path
        for marker in ['personal_willy/', 'obsidian/']:
            if marker in file_path:
                note_path = file_path.split(marker, 1)[1]
                break

        file_name = meta.get('file_name', os.path.basename(note_path))
        title = file_name.replace('.md', '')

        chunks.append({
            'content': node.node.text,
            'notePath': note_path,
            'similarity': round(float(node.score or 0), 4),
            'metadata': {'title': title},
        })

    print(json.dumps({'chunks': chunks}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(json.dumps({'chunks': [], 'error': str(e)}), file=sys.stderr)
        sys.exit(1)
