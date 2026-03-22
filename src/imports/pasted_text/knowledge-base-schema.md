## Product Overview
This is a local-first knowledge base system that allows users to store notes in Markdown format and interact with them using AI. The system supports semantic search, automatic note linking (like a Zettelkasten), and conversational querying.
The product has both:
- Local desktop usage (primary)
## Core Features
1. Chat with Knowledge Base at # 所有檔案與搜尋
- Answers are generated from user's notes
- Show referenced notes and chunks
- Ability to open source note
- Option to save answer as a new note
## UI Requirements
- Clean, minimal, modern design (similar to Notion + Obsidian + ChatGPT hybrid)
- Dark mode default
- Emphasize readability (Markdown-focused)
- Show connections between notes clearly
- Highlight AI-generated suggestions vs user content
## Platforms
- Desktop (primary experience)
Markdown Files
  └─ 真正內容
SQLite
  ├─ notes
  ├─ note_chunks
  ├─ tags / note_tags
  ├─ entities / note_entities / chunk_entities
  ├─ note_links
  ├─ processing_jobs
  ├─ sync_log
  └─ FTS index
Vector DB
  ├─ chunk embeddings
  └─ note embeddings
Application
  ├─ Capture
  ├─ Library
  ├─ Semantic Search
  ├─ Chat RAG
  └─ Link Suggestion
arch
/knowledge-base  
  /notes                  # 原始與整理後 md  
  /attachments            # 圖片、pdf、檔案  
  /db  
    app.db                # SQLite  
    /vectors              # vector db 資料
三層分工：
## 1. Markdown
存：
- 筆記正文
- 原始文章
- 整理後卡片
- 使用者可直接編輯的內容
## 2. SQLite
存：
- note 清單
- chunk metadata
- tags
- entities
- note 關聯
- sync 狀態
- 搜尋用 FTS
- 使用者操作狀態
## 3. Vector DB
存：
- chunk embedding
- note embedding
- metadata filter 欄位
- 相似度搜尋索引
# SQLite 應該有哪些 table
我先給你一版實用 schema。
---
## 1. notes
每一篇筆記一筆
CREATE TABLE notes (  
    id TEXT PRIMARY KEY,                -- note_20260321_xxx  
    title TEXT NOT NULL,  
    note_type TEXT NOT NULL,            -- source / fleeting / literature / permanent  
    source_type TEXT,                   -- url / manual / import / chat  
    source_url TEXT,  
    file_path TEXT NOT NULL,            -- md 檔實際路徑  
    raw_file_path TEXT,                 -- 原始資料 md 路徑  
    status TEXT DEFAULT 'active',       -- active / archived / deleted  
    processing_status TEXT DEFAULT 'pending', -- pending / processed / error  
    summary TEXT,  
    language TEXT,  
    created_at TEXT NOT NULL,  
    updated_at TEXT NOT NULL,  
    indexed_at TEXT,  
    content_hash TEXT,                  -- 判斷內容是否變更  
    sync_status TEXT DEFAULT 'local_only', -- local_only / pending / synced / conflict  
    sync_version INTEGER DEFAULT 1  
);
### 用途
這是主表，所有東西都會連到 `notes.id`
---
## 2. note_chunks
每篇筆記切片後的 chunk
CREATE TABLE note_chunks (  
    id TEXT PRIMARY KEY,                -- chunk_xxx  
    note_id TEXT NOT NULL,  
    chunk_index INTEGER NOT NULL,  
    chunk_type TEXT,                    -- concept / quote / example / summary / paragraph  
    heading_path TEXT,                  -- 例如 "GTD > Weekly Review"  
    content TEXT NOT NULL,  
    token_count INTEGER,  
    char_count INTEGER,  
    summary TEXT,  
    keywords TEXT,                      -- JSON 字串  
    embedding_id TEXT,                  -- 對應 vector db 的 id  
    created_at TEXT NOT NULL,  
    updated_at TEXT NOT NULL,  
    FOREIGN KEY (note_id) REFERENCES notes(id)  
);
### 用途
這張表是語義搜尋與引用顯示的核心。
聊天不是直接對整篇 note 搜，而是大多對 `note_chunks` 搜。
---
## 3. tags
標籤主表
CREATE TABLE tags (  
    id INTEGER PRIMARY KEY AUTOINCREMENT,  
    name TEXT NOT NULL UNIQUE  
);
---
## 4. note_tags
note 與 tag 的多對多
CREATE TABLE note_tags (  
    note_id TEXT NOT NULL,  
    tag_id INTEGER NOT NULL,  
    PRIMARY KEY (note_id, tag_id),  
    FOREIGN KEY (note_id) REFERENCES notes(id),  
    FOREIGN KEY (tag_id) REFERENCES tags(id)  
);
---
## 5. entities
抽出的實體或概念
CREATE TABLE entities (  
    id TEXT PRIMARY KEY,                -- entity_gtd  
    name TEXT NOT NULL,  
    entity_type TEXT,                   -- concept / person / book / tool / topic  
    description TEXT  
);
---
## 6. note_entities
某篇 note 跟哪些 entity 有關
CREATE TABLE note_entities (  
    note_id TEXT NOT NULL,  
    entity_id TEXT NOT NULL,  
    score REAL DEFAULT 1.0,  
    PRIMARY KEY (note_id, entity_id),  
    FOREIGN KEY (note_id) REFERENCES notes(id),  
    FOREIGN KEY (entity_id) REFERENCES entities(id)  
);
---
## 7. chunk_entities
更細，某個 chunk 出現哪些 entity
CREATE TABLE chunk_entities (  
    chunk_id TEXT NOT NULL,  
    entity_id TEXT NOT NULL,  
    score REAL DEFAULT 1.0,  
    PRIMARY KEY (chunk_id, entity_id),  
    FOREIGN KEY (chunk_id) REFERENCES note_chunks(id),  
    FOREIGN KEY (entity_id) REFERENCES entities(id)  
);
---
## 8. note_links
卡片盒連結 / wikilink / AI 建議連結
CREATE TABLE note_links (  
    id TEXT PRIMARY KEY,  
    from_note_id TEXT NOT NULL,  
    to_note_id TEXT NOT NULL,  
    link_type TEXT NOT NULL,            -- manual / ai_suggested / semantic / wikilink  
    relation_type TEXT,                 -- similar / supports / contrasts / extends / example_of  
    score REAL,  
    status TEXT DEFAULT 'suggested',    -- suggested / accepted / rejected  
    created_at TEXT NOT NULL,  
    FOREIGN KEY (from_note_id) REFERENCES notes(id),  
    FOREIGN KEY (to_note_id) REFERENCES notes(id)  
);
### 這張表很重要
因為你要做卡片盒，不只是搜尋，要能知道「這兩篇為什麼有關」。
---
## 9. sources
如果你很重視來源管理，可獨立一張表
CREATE TABLE sources (  
    id TEXT PRIMARY KEY,  
    note_id TEXT NOT NULL,  
    source_kind TEXT NOT NULL,          -- url / article / pdf / manual_input  
    source_url TEXT,  
    author TEXT,  
    published_at TEXT,  
    site_name TEXT,  
    title TEXT,  
    FOREIGN KEY (note_id) REFERENCES notes(id)  
);
---
## 10. attachments
附件表
CREATE TABLE attachments (  
    id TEXT PRIMARY KEY,  
    note_id TEXT NOT NULL,  
    file_name TEXT NOT NULL,  
    file_path TEXT NOT NULL,  
    mime_type TEXT,  
    created_at TEXT NOT NULL,  
    FOREIGN KEY (note_id) REFERENCES notes(id)  
);
---
## 11. sync_log
同步狀態與記錄
CREATE TABLE sync_log (  
    id INTEGER PRIMARY KEY AUTOINCREMENT,  
    note_id TEXT,  
    action TEXT NOT NULL,               -- upload / download / conflict / delete  
    status TEXT NOT NULL,               -- success / failed / pending  
    message TEXT,  
    created_at TEXT NOT NULL,  
    FOREIGN KEY (note_id) REFERENCES notes(id)  
);
---
## 12. processing_jobs
AI 處理流程追蹤
CREATE TABLE processing_jobs (  
    id TEXT PRIMARY KEY,  
    note_id TEXT NOT NULL,  
    job_type TEXT NOT NULL,             -- parse / chunk / embed / classify / link  
    status TEXT NOT NULL,               -- pending / running / done / error  
    error_message TEXT,  
    started_at TEXT,  
    finished_at TEXT,  
    FOREIGN KEY (note_id) REFERENCES notes(id)  
);
---
# 四、SQLite 還要加 FTS 全文搜尋
你需要語義搜尋，但也一定要有精準關鍵字搜尋。
所以建議加：
## note_chunks_fts
用 FTS5 對 chunk 做全文搜尋
CREATE VIRTUAL TABLE note_chunks_fts USING fts5(  
    chunk_id,  
    note_id,  
    content,  
    heading_path,  
    content='',  
    tokenize='unicode61'  
);
你也可以選擇用 external content table 模式，但 MVP 先簡單就好。
### 搜尋時策略
- keyword search：查 `note_chunks_fts`
- semantic search：查 vector db
- 最後 merge 結果
這就是 hybrid search。
---
# 五、Vector DB 應該存什麼
向量庫不要存一堆完整業務資料。  
它只需要存：
- `id`
- `vector`
- 少量 metadata
- 可回查 SQLite 的 key
---
## 建議向量存兩種層級
### 1. chunk-level embedding
最重要
每個 chunk 一個向量，適合問答、引用、語義搜尋。
### 2. note-level embedding
可選
整篇筆記一個向量，適合：
- 找相似筆記
- 首頁推薦
- 卡片盒建議連結
---
## Vector metadata 建議欄位
假設用 Qdrant / Chroma / LanceDB，都可以保留類似 metadata：
{  
  "id": "chunk_001",  
  "note_id": "note_001",  
  "chunk_index": 3,  
  "note_type": "literature",  
  "source_type": "url",  
  "title": "GTD 週回顧的真正目的",  
  "heading_path": "週回顧 > 核心概念",  
  "tags": ["productivity", "gtd"],  
  "entities": ["GTD", "weekly review"],  
  "created_at": "2026-03-21T10:30:00+08:00",  
  "updated_at": "2026-03-21T10:45:00+08:00"  
}
---
# 六、SQLite 與 Vector DB 的關係
最重要原則：
## SQLite 是主控制台
- 哪些筆記存在
- 哪些 chunk 存在
- 狀態是什麼
- 關聯是什麼
## Vector DB 是查詢加速器
- 找語義相近 chunk
- 找相似 note
- 做推薦候選集
也就是：
User query  
  → embedding  
  → vector db 找候選 chunks  
  → chunk_id / note_id 回查 SQLite  
  → 組合 metadata / tags / links / file_path  
  → 回給 LLM 或 UI