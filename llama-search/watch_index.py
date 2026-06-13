import time
import threading
from pathlib import Path

from watchdog.observers.polling import PollingObserver as Observer
from watchdog.events import FileSystemEventHandler

from llama_index.core import (
    StorageContext,
    load_index_from_storage,
    SimpleDirectoryReader,
    Settings,
)
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.ollama import Ollama

from _device import pick_device

VAULT_DIR = "/mnt/d/obsidian/personal_willy"
import os
PERSIST_DIR = os.environ.get("LLAMA_STORAGE_DIR") or "./storage"
DEBOUNCE_SECONDS = 2.0


def load_index():
    storage_context = StorageContext.from_defaults(persist_dir=PERSIST_DIR)
    return load_index_from_storage(storage_context)


class VaultEventHandler(FileSystemEventHandler):
    def __init__(self, index):
        self.index = index
        self._timers: dict[str, threading.Timer] = {}
        self._lock = threading.Lock()

    def _debounce(self, key: str, fn, *args):
        with self._lock:
            if key in self._timers:
                self._timers[key].cancel()
            t = threading.Timer(DEBOUNCE_SECONDS, fn, args)
            self._timers[key] = t
            t.start()

    def on_created(self, event):
        if not event.is_directory and event.src_path.endswith(".md"):
            self._debounce(event.src_path, self._upsert, event.src_path)

    def on_modified(self, event):
        if not event.is_directory and event.src_path.endswith(".md"):
            self._debounce(event.src_path, self._upsert, event.src_path)

    def on_deleted(self, event):
        if not event.is_directory and event.src_path.endswith(".md"):
            self._debounce(event.src_path, self._delete, event.src_path)

    def on_moved(self, event):
        if not event.is_directory:
            if event.src_path.endswith(".md"):
                self._debounce(event.src_path, self._delete, event.src_path)
            if event.dest_path.endswith(".md"):
                self._debounce(event.dest_path, self._upsert, event.dest_path)

    def _upsert(self, path: str):
        try:
            docs = SimpleDirectoryReader(input_files=[path]).load_data()
            # 先刪除舊版本（若存在），再插入新版本
            try:
                self.index.delete_ref_doc(path, delete_from_docstore=True)
            except Exception:
                pass
            for doc in docs:
                doc.doc_id = path  # 用路徑作為穩定 ID，方便日後刪除
                self.index.insert(doc)
            self.index.storage_context.persist(persist_dir=PERSIST_DIR)
            print(f"[+] Indexed:  {Path(path).name}")
        except Exception as e:
            print(f"[!] Error indexing {path}: {e}")

    def _delete(self, path: str):
        try:
            self.index.delete_ref_doc(path, delete_from_docstore=True)
            self.index.storage_context.persist(persist_dir=PERSIST_DIR)
            print(f"[-] Removed:  {Path(path).name}")
        except Exception as e:
            print(f"[!] Error removing {path}: {e}")


def sync_missing(index, index_mtime: float):
    """啟動時補索引：找出比 index 還新的 .md 檔並加入。"""
    new_files = [
        p for p in Path(VAULT_DIR).rglob("*.md")
        if p.is_file() and p.stat().st_mtime > index_mtime
    ]
    if not new_files:
        print("No new files since last index build.")
        return
    print(f"Found {len(new_files)} new/updated files, syncing ...")
    handler = VaultEventHandler(index)
    for p in new_files:
        handler._upsert(str(p))
    print("Startup sync done.\n")


def main():
    Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-m3", device=pick_device())
    Settings.llm = Ollama(model="qwen2.5", request_timeout=120.0)

    print(f"Loading index from {PERSIST_DIR} ...")
    index = load_index()
    index_mtime = Path(PERSIST_DIR, "index_store.json").stat().st_mtime
    print("Index loaded. Checking for missed files ...\n")

    sync_missing(index, index_mtime)
    print("Starting file watcher ...")

    handler = VaultEventHandler(index)
    observer = Observer()
    observer.schedule(handler, VAULT_DIR, recursive=True)
    observer.start()

    print(f"Watching: {VAULT_DIR}")
    print("Press Ctrl+C to stop.\n")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping watcher ...")
        observer.stop()
    observer.join()
    print("Done.")


if __name__ == "__main__":
    main()
