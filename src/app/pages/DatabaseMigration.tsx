import { useState } from 'react';
import { Database, AlertTriangle, CheckCircle, Copy } from 'lucide-react';
import { Button } from '../components/ui/button';
import { projectId, publicAnonKey } from '/utils/supabase/info';

export function DatabaseMigration() {
  const [status, setStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const sqlScript = `-- Knowledge Base Schema for Zettelkasten App
-- Execute this in Supabase SQL Editor: https://supabase.com/dashboard/project/${projectId}/sql

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Notes table - Main table for all notes (content moved to note_chunks)
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
    embedding vector(1536),
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

-- 5. Entities table
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

-- 8. Note links table
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

-- 9. Sources table
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

-- 12. Processing jobs table
CREATE TABLE IF NOT EXISTS processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL CHECK (job_type IN ('parse', 'chunk', 'embed', 'classify', 'link')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'done', 'error')),
    error_message TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(note_type);
CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_note_chunks_note_id ON note_chunks(note_id);
CREATE INDEX IF NOT EXISTS idx_note_chunks_embedding ON note_chunks USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_note_chunks_content_search ON note_chunks USING gin (to_tsvector('english', content));

CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON note_tags(note_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON note_tags(tag_id);

CREATE INDEX IF NOT EXISTS idx_note_links_from ON note_links(from_note_id);
CREATE INDEX IF NOT EXISTS idx_note_links_to ON note_links(to_note_id);
CREATE INDEX IF NOT EXISTS idx_note_links_status ON note_links(status);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_notes_updated_at
    BEFORE UPDATE ON notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_note_chunks_updated_at
    BEFORE UPDATE ON note_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunk_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (adjust based on your auth requirements)
CREATE POLICY "Allow all operations on notes" ON notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on note_chunks" ON note_chunks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on tags" ON tags FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on note_tags" ON note_tags FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on entities" ON entities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on note_entities" ON note_entities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on chunk_entities" ON chunk_entities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on note_links" ON note_links FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on sources" ON sources FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on attachments" ON attachments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on sync_log" ON sync_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on processing_jobs" ON processing_jobs FOR ALL USING (true) WITH CHECK (true);`;

  const checkDatabase = async () => {
    setStatus('checking');
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc3187a2/init/check`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      const result = await response.json();
      
      if (result.healthy) {
        setStatus('success');
        setMessage('資料庫 schema 已正確初始化！');
      } else {
        setStatus('error');
        setMessage(result.error || '資料庫 schema 尚未初始化');
      }
    } catch (error: any) {
      setStatus('error');
      setMessage('無法連接到資料庫：' + error.message);
    }
  };

  const resetDatabase = async () => {
    if (!confirm('⚠️ 警告：這將刪除所有現有資料！\n\n確定要重置資料庫嗎？')) {
      return;
    }

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc3187a2/init/reset`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      const result = await response.json();
      
      if (result.success) {
        setStatus('success');
        setMessage('資料庫已成功重置！所有舊資料已清除。');
      } else {
        setStatus('error');
        setMessage('重置失敗：' + result.error);
      }
    } catch (error: any) {
      setStatus('error');
      setMessage('重置失敗：' + error.message);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(sqlScript);
      alert('SQL 腳本已複製到剪貼簿！');
    } catch (error) {
      alert('複製失敗，請手動選擇並複製。');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="mb-2 flex items-center gap-2">
          <Database className="size-8" />
          資料庫遷移與初始化
        </h1>
        <p className="text-gray-600">
          管理資料庫 schema 和清除舊資料
        </p>
      </div>

      {/* Status Display */}
      {status !== 'idle' && (
        <div className={`mb-6 p-4 rounded-lg border ${
          status === 'success' 
            ? 'bg-green-50 border-green-200' 
            : status === 'error'
            ? 'bg-red-50 border-red-200'
            : 'bg-blue-50 border-blue-200'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {status === 'success' && <CheckCircle className="size-5 text-green-600" />}
            {status === 'error' && <AlertTriangle className="size-5 text-red-600" />}
            <h3 className={`font-medium ${
              status === 'success' ? 'text-green-900' : status === 'error' ? 'text-red-900' : 'text-blue-900'
            }`}>
              {status === 'checking' ? '檢查中...' : status === 'success' ? '成功' : '錯誤'}
            </h3>
          </div>
          <p className={status === 'success' ? 'text-green-700' : status === 'error' ? 'text-red-700' : 'text-blue-700'}>
            {message}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="border rounded-lg p-6">
          <h2 className="text-lg font-medium mb-2">檢查資料庫狀態</h2>
          <p className="text-sm text-gray-600 mb-4">
            驗證資料庫 schema 是否正確初始化
          </p>
          <Button onClick={checkDatabase} disabled={status === 'checking'}>
            檢查資料庫
          </Button>
        </div>

        <div className="border rounded-lg p-6 bg-red-50">
          <h2 className="text-lg font-medium mb-2 text-red-900">清空資料庫</h2>
          <p className="text-sm text-red-700 mb-4">
            ⚠️ 這將刪除所有筆記和相關資料
          </p>
          <Button onClick={resetDatabase} variant="destructive">
            重置資料庫
          </Button>
        </div>
      </div>

      {/* SQL Script */}
      <div className="border rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">SQL 初始化腳本</h2>
          <div className="flex gap-2">
            <Button onClick={copyToClipboard} variant="outline" size="sm">
              <Copy className="size-4 mr-2" />
              複製腳本
            </Button>
            <a
              href={`https://supabase.com/dashboard/project/${projectId}/sql`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="sm">
                開啟 SQL Editor
              </Button>
            </a>
          </div>
        </div>
        
        <div className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto">
          <pre className="text-xs">
            <code>{sqlScript}</code>
          </pre>
        </div>
      </div>

      {/* Instructions */}
      <div className="border rounded-lg p-6 bg-blue-50">
        <h2 className="text-lg font-medium mb-3 text-blue-900">初始化步驟</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
          <li>點擊「開啟 SQL Editor」按鈕前往 Supabase Dashboard</li>
          <li>點擊「複製腳本」按鈕複製上方的 SQL 腳本</li>
          <li>在 SQL Editor 中貼上並執行腳本</li>
          <li>執行完成後，點擊「檢查資料庫」確認初始化成功</li>
          <li>如果有舊資料導致錯誤，可以點擊「重置資料庫」清空後重新執行</li>
        </ol>
      </div>
    </div>
  );
}