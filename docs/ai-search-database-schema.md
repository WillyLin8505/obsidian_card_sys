# AI Search Database Schema

## 概述

此文檔描述了 AI 搜索功能所需的數據庫表結構。

## 數據庫表：`ai_search_results`

您需要在 Supabase 數據庫中創建此表來存儲 AI 搜索的歷史記錄和結果。

### SQL 創建語句

```sql
CREATE TABLE IF NOT EXISTS ai_search_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  chunks JSONB DEFAULT '[]'::jsonb,
  connection_status TEXT DEFAULT 'connected',
  search_time INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 創建索引以提高查詢性能
CREATE INDEX idx_ai_search_created_at ON ai_search_results(created_at DESC);
CREATE INDEX idx_ai_search_question ON ai_search_results USING gin(to_tsvector('english', question));
```

### 表結構說明

| 欄位名稱 | 類型 | 說明 |
|---------|------|------|
| `id` | UUID | 主鍵，自動生成 |
| `question` | TEXT | 用戶提出的問題 |
| `answer` | TEXT | Claude AI 生成的答案 |
| `chunks` | JSONB | 從 Obsidian 檢索的筆記片段陣列 |
| `connection_status` | TEXT | 連接狀態 (connected/disconnected/searching) |
| `search_time` | INTEGER | 搜索耗時（毫秒） |
| `metadata` | JSONB | 額外元數據（如模型名稱、Token 用量等） |
| `created_at` | TIMESTAMPTZ | 創建時間戳 |

### Chunks JSONB 結構

每個 chunk 對象包含以下欄位：

```json
{
  "content": "筆記片段內容...",
  "notePath": "/path/to/note.md",
  "similarity": 0.85,
  "metadata": {
    "title": "筆記標題",
    "tags": ["tag1", "tag2"],
    "created": "2024-01-01"
  }
}
```

### Metadata JSONB 結構

```json
{
  "model": "claude-3-5-sonnet",
  "tokensUsed": 1200
}
```

## 如何在 Supabase 中創建表

1. 登錄 Supabase Dashboard
2. 選擇您的專案
3. 點擊左側選單的 **SQL Editor**
4. 複製上面的 SQL 創建語句
5. 貼上並執行

## Row Level Security (RLS)

如果您的應用需要用戶級別的訪問控制，可以啟用 RLS：

```sql
-- 啟用 RLS
ALTER TABLE ai_search_results ENABLE ROW LEVEL SECURITY;

-- 允許所有人讀取（根據需求調整）
CREATE POLICY "Allow all to read" ON ai_search_results
  FOR SELECT USING (true);

-- 允許所有人插入（根據需求調整）
CREATE POLICY "Allow all to insert" ON ai_search_results
  FOR INSERT WITH CHECK (true);
```

## 注意事項

- 此表用於存儲 AI 搜索的歷史記錄
- 不會自動清理舊數據，建議定期清理或設置保留策略
- JSONB 欄位允許靈活存儲複雜數據結構
