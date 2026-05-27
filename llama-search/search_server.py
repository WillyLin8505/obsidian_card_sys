"""
語義搜尋常駐 Server (v2 — Hybrid + Rerank + Cache + CUDA)

優化項目：
  1. CUDA 加速 bge-m3 query encoding
  2. 查詢結果 LRU 快取（60s TTL）
  3. Server 端模板路徑過濾
  4. Hybrid Search：BM25 關鍵字 + bge-m3 向量，RRF 合併
  5. Cross-encoder reranker（BAAI/bge-reranker-base）精排

啟動：python search_server.py
Port：8765
"""

import re
import time
import hashlib
import os
import tempfile
from pathlib import Path
from contextlib import asynccontextmanager
from collections import Counter
from datetime import datetime, timezone

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel

try:
    from funasr import AutoModel as _FunASRModel
    _FUNASR_AVAILABLE = True
except ImportError:
    _FUNASR_AVAILABLE = False
    print("[funasr] 未安裝，/transcribe 端點不可用。請執行: pip install funasr modelscope", flush=True)

from llama_index.core import StorageContext, load_index_from_storage, Settings
from llama_index.core.retrievers import VectorIndexRetriever
from llama_index.core.schema import QueryBundle
from llama_index.retrievers.bm25 import BM25Retriever
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.core.llms import MockLLM
from sentence_transformers import CrossEncoder

PERSIST_DIR = Path(__file__).parent / "storage"
VAULT_DIR = Path("/mnt/d/obsidian/personal_willy")
EMBED_MODEL_NAME = "BAAI/bge-m3"
RERANK_MODEL_NAME = "BAAI/bge-reranker-base"
PORT = 8765
CACHE_TTL = 60.0    # 秒
RERANK_TOP_N = 15   # cross-encoder 重排後最終回傳筆數

TEMPLATE_KEYWORDS = {"template", "模板"}

state: dict = {}
_cache: dict[str, tuple] = {}


# ── 快取 ──────────────────────────────────────────────────────────

def _cache_key(question: str, top_k: int) -> str:
    return hashlib.md5(f"{question}:{top_k}".encode()).hexdigest()


def _get_cached(key: str):
    entry = _cache.get(key)
    if entry and time.time() - entry[1] < CACHE_TTL:
        return entry[0]
    _cache.pop(key, None)
    return None


def _set_cached(key: str, result):
    if len(_cache) > 256:
        _cache.clear()
    _cache[key] = (result, time.time())


# ── 工具函式 ──────────────────────────────────────────────────────

def is_template_path(path: str) -> bool:
    lower = path.lower()
    return any(kw in lower for kw in TEMPLATE_KEYWORDS)


def to_note_path(abs_path: str) -> str:
    try:
        return str(Path(abs_path).relative_to(VAULT_DIR))
    except ValueError:
        return abs_path


def parse_frontmatter(text: str) -> dict:
    result: dict = {"title": None, "tags": [], "connect": []}
    fm_match = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    if not fm_match:
        return result
    fm = fm_match.group(1)
    title_m = re.search(r"^(?:title|abstract):\s*(.+)$", fm, re.MULTILINE)
    if title_m:
        result["title"] = title_m.group(1).strip().strip('"\'')
    in_block = None
    for line in fm.splitlines():
        if re.match(r"^(connect|tags)\s*:", line):
            m = re.match(r"^(\w+)\s*:", line)
            in_block = m.group(1) if m else None
            continue
        if in_block:
            item = re.match(r"^\s+-\s+(.+)", line)
            if item:
                val = item.group(1).strip()
                if val and not val.startswith("3card/"):
                    result[in_block].append(val)
            elif line and not line.startswith(" "):
                in_block = None
    return result


def extract_keywords(query: str, nodes: list) -> list[str]:
    counter: Counter = Counter()
    for node in nodes:
        fm = parse_frontmatter(node.text)
        for tag in fm["connect"] + fm["tags"]:
            counter[tag] += 1
    top = [kw for kw, _ in counter.most_common(3)]
    for word in query.split():
        if len(top) >= 3:
            break
        if word not in top:
            top.append(word)
    return top[:3]


def reciprocal_rank_fusion(results_list: list, k: int = 60) -> list:
    """將多個排序結果用 RRF 合併。"""
    scores: dict = {}
    for results in results_list:
        for rank, nws in enumerate(results):
            nid = nws.node.node_id
            if nid not in scores:
                scores[nid] = {"nws": nws, "score": 0.0}
            scores[nid]["score"] += 1.0 / (k + rank + 1)
    return [v["nws"] for v in sorted(scores.values(), key=lambda x: x["score"], reverse=True)]


class CrossEncoderReranker:
    """sentence_transformers CrossEncoder 包裝，介面相容原本的 postprocess_nodes。"""

    def __init__(self, model_name: str, top_n: int):
        self.model = CrossEncoder(model_name)
        self.top_n = top_n

    def postprocess_nodes(self, nodes: list, query_bundle) -> list:
        if not nodes:
            return nodes
        query = query_bundle.query_str
        pairs = [(query, n.text) for n in nodes]
        scores = self.model.predict(pairs, show_progress_bar=False)
        scored = sorted(zip(nodes, scores.tolist()), key=lambda x: x[1], reverse=True)
        result = []
        for nws, score in scored[: self.top_n]:
            nws.score = float(score)
            result.append(nws)
        return result


# ── State 載入 ────────────────────────────────────────────────────

def load_state_from_disk():
    """從磁碟載入 index，建立 BM25 + vector retriever 和 reranker。"""
    storage_context = StorageContext.from_defaults(persist_dir=str(PERSIST_DIR))
    index = load_index_from_storage(storage_context)
    all_nodes = list(index.docstore.docs.values())

    vec_retriever = VectorIndexRetriever(index=index, similarity_top_k=30)
    bm25_retriever = BM25Retriever.from_defaults(nodes=all_nodes, similarity_top_k=30)
    reranker = CrossEncoderReranker(model_name=RERANK_MODEL_NAME, top_n=RERANK_TOP_N)

    state["index"] = index
    state["vec_retriever"] = vec_retriever
    state["bm25_retriever"] = bm25_retriever
    state["reranker"] = reranker
    _cache.clear()
    print(f"[index] 載入 {len(all_nodes)} 個節點，BM25 + vector 就緒", flush=True)


# ── FastAPI ───────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("載入 Embedding 模型（CUDA）...", flush=True)
    Settings.embed_model = HuggingFaceEmbedding(model_name=EMBED_MODEL_NAME, device="cuda")
    Settings.llm = MockLLM()
    load_state_from_disk()
    # warm-up：讓第一次真實查詢不慢
    state["vec_retriever"].retrieve("warmup")
    # FunASR 改為懶載入：第一次呼叫 /transcribe 時才載入，避免啟動時凍結
    print(f"Server 就緒，監聽 port {PORT}", flush=True)
    yield
    state.clear()


app = FastAPI(lifespan=lifespan)


# ── Pydantic models ───────────────────────────────────────────────

class SearchRequest(BaseModel):
    question: str
    top_k: int = 30


class NoteChunkMetadata(BaseModel):
    title: str | None = None


class NoteChunk(BaseModel):
    content: str
    notePath: str
    similarity: float
    metadata: NoteChunkMetadata


class SearchResponse(BaseModel):
    id: str
    question: str
    answer: str
    chunks: list[NoteChunk]
    keywords: list[str]
    connectionStatus: str
    searchTime: int
    createdAt: str


# ── Routes ────────────────────────────────────────────────────────

@app.post("/search", response_model=SearchResponse)
def search(req: SearchRequest):
    key = _cache_key(req.question, req.top_k)
    cached = _get_cached(key)
    if cached:
        return cached

    if "index" not in state:
        raise HTTPException(status_code=503, detail="模型尚未載入")

    start = time.time()

    vec_retriever = state["vec_retriever"]
    bm25_retriever = state["bm25_retriever"]
    reranker = state["reranker"]

    # 動態調整 top_k
    vec_retriever.similarity_top_k = req.top_k
    bm25_retriever.similarity_top_k = req.top_k

    # 雙路檢索
    vec_results = vec_retriever.retrieve(req.question)
    bm25_results = bm25_retriever.retrieve(req.question)

    # RRF 合併
    fused = reciprocal_rank_fusion([vec_results, bm25_results])

    # Cross-encoder 精排
    reranked = reranker.postprocess_nodes(fused, QueryBundle(query_str=req.question))

    # Server 端過濾模板
    reranked = [n for n in reranked if not is_template_path(n.metadata.get("file_path", ""))]

    search_ms = int((time.time() - start) * 1000)

    chunks = []
    for n in reranked:
        fm = parse_frontmatter(n.text)
        abs_path = n.metadata.get("file_path", "")
        chunks.append(NoteChunk(
            content=n.text,
            notePath=to_note_path(abs_path),
            similarity=n.score or 0.0,
            metadata=NoteChunkMetadata(title=fm["title"]),
        ))

    raw_nodes = [n.node for n in reranked]
    keywords = extract_keywords(req.question, raw_nodes)

    result = SearchResponse(
        id=f"search_{int(time.time() * 1000)}",
        question=req.question,
        answer="",
        chunks=chunks,
        keywords=keywords,
        connectionStatus="connected",
        searchTime=search_ms,
        createdAt=datetime.now(timezone.utc).isoformat(),
    )
    _set_cached(key, result)
    return result


@app.post("/transcribe")
async def transcribe(request: Request):
    if not _FUNASR_AVAILABLE:
        raise HTTPException(status_code=501, detail="FunASR 未安裝，請執行: pip install funasr modelscope")
    if "asr_model" not in state:
        print("懶載入 FunASR paraformer-zh...", flush=True)
        state["asr_model"] = _FunASRModel(
            model="paraformer-zh",
            model_revision="v2.0.4",
            disable_update=True,
        )
        print("FunASR 就緒", flush=True)
    audio_bytes = await request.body()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="未收到音訊")
    content_type = request.headers.get("content-type", "audio/wav")
    suffix = ".ogg" if "ogg" in content_type else ".wav" if "wav" in content_type else ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    try:
        result = state["asr_model"].generate(input=tmp_path, batch_size_s=300)
        text = result[0]["text"].strip() if result else ""
        return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)


@app.post("/reload")
def reload_index():
    """重新從磁碟載入 index 並重建 BM25（update_one.py 更新後呼叫）。"""
    try:
        load_state_from_disk()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    return {"status": "ok", "ready": "index" in state}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT)
