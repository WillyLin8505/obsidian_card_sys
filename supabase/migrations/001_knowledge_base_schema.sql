-- Knowledge Base Schema for Zettelkasten App
-- Execute this in Supabase SQL Editor: https://supabase.com/dashboard/project/hhomwbsgcimvlgdbtbis/sql

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Notes table - Main table for all notes
CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    note_type TEXT NOT NULL CHECK (note_type IN ('fleet', 'source', 'permanent')),
    source_type TEXT,
    source_url TEXT,
    file_path TEXT,
    raw_file_path TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processed', 'error')),
    summary TEXT,
    language TEXT DEFAULT 'zh-TW',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    indexed_at TIMESTAMPTZ,
    content_hash TEXT,
    sync_status TEXT DEFAULT 'local_only' CHECK (sync_status IN ('local_only', 'pending', 'synced', 'conflict')),
    sync_version INTEGER DEFAULT 1
);

-- 2. Note chunks table - For semantic search and citations
CREATE TABLE IF NOT EXISTS note_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_type TEXT,
    heading_path TEXT,
    content TEXT NOT NULL,
    token_count INTEGER,
    char_count INTEGER,
    summary TEXT,
    keywords JSONB,
    embedding vector(1536),  -- OpenAI embedding dimension
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tags table
CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

-- 4. Note-Tags junction table
CREATE TABLE IF NOT EXISTS note_tags (
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

-- 5. Entities table - Extracted concepts, people, books, etc.
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    entity_type TEXT CHECK (entity_type IN ('concept', 'person', 'book', 'tool', 'topic')),
    description TEXT
);

-- 6. Note-Entities junction table
CREATE TABLE IF NOT EXISTS note_entities (
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    score REAL DEFAULT 1.0,
    PRIMARY KEY (note_id, entity_id)
);

-- 7. Chunk-Entities junction table
CREATE TABLE IF NOT EXISTS chunk_entities (
    chunk_id UUID NOT NULL REFERENCES note_chunks(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    score REAL DEFAULT 1.0,
    PRIMARY KEY (chunk_id, entity_id)
);

-- 8. Note links table - Zettelkasten connections
CREATE TABLE IF NOT EXISTS note_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    to_note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    link_type TEXT NOT NULL CHECK (link_type IN ('manual', 'ai_suggested', 'semantic', 'wikilink')),
    relation_type TEXT CHECK (relation_type IN ('similar', 'supports', 'contrasts', 'extends', 'example_of')),
    score REAL,
    status TEXT DEFAULT 'suggested' CHECK (status IN ('suggested', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Sources table - For literature notes
CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('url', 'article', 'pdf', 'manual_input')),
    source_url TEXT,
    author TEXT,
    published_at TIMESTAMPTZ,
    site_name TEXT,
    title TEXT
);

-- 10. Attachments table
CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Sync log table
CREATE TABLE IF NOT EXISTS sync_log (
    id SERIAL PRIMARY KEY,
    note_id UUID REFERENCES notes(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('upload', 'download', 'conflict', 'delete')),
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Processing jobs table - AI processing tracking
CREATE TABLE IF NOT EXISTS processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL CHECK (job_type IN ('parse', 'chunk', 'embed', 'classify', 'link')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'done', 'error')),
    error_message TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);