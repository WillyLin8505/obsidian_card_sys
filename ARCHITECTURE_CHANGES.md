# 架構變更記錄

## 2026-03-21: 內容存儲架構重構

### 變更摘要
將筆記內容從 `notes` 表遷移到 `note_chunks` 表，以支援更好的語義搜尋和分塊功能。

### 詳細變更

#### 1. 資料庫 Schema 變更
**修改檔案**: `/supabase/migrations/001_knowledge_base_schema.sql`

- **移除**: `notes.content` 欄位
- **保留**: `notes` 表的所有其他欄位（title, note_type, source_url 等）
- **使用**: `note_chunks.content` 作為主要內容存儲

```sql
-- 舊架構
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,  -- 已移除
    ...
);

-- 新架構
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    -- content 欄位已移除
    ...
);

CREATE TABLE note_chunks (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES notes(id),
    content TEXT NOT NULL,  -- 內容現在存儲在這裡
    chunk_index INTEGER NOT NULL,
    ...
);
```

#### 2. 後端 API 變更
**修改檔案**: `/supabase/functions/server/notes.tsx`

##### GET /notes (獲取所有筆記)
- 從 `notes` 表獲取元資料
- 從 `note_chunks` 表獲取內容
- 合併多個 chunks 為完整內容

##### GET /notes/:id (獲取單個筆記)
- 從 `notes` 表獲取元資料和連結
- 從 `note_chunks` 表獲取內容（按 chunk_index 排序）
- 組合成完整筆記對象

##### POST /notes (創建筆記)
- 在 `notes` 表創建筆記記錄（不包含 content）
- 在 `note_chunks` 表創建 chunk（chunk_index = 0）
- 如果 chunk 創建失敗，清理 notes 記錄

##### PUT /notes/:id (更新筆記)
- 更新 `notes` 表的元資料
- 刪除舊的 chunks
- 創建新的 chunk（chunk_index = 0）

##### GET /notes/search (搜尋筆記)
- 在 `note_chunks` 表中搜尋內容
- Join `notes` 表獲取元資料
- 合併同一筆記的多個 chunks

#### 3. 初始化檢查變更
**修改檔案**: `/supabase/functions/server/init.tsx`

- 健康檢查不再查詢 `notes.content`
- 只查詢 `id, title, note_type` 欄位

### 架構優勢

1. **語義搜尋準備**
   - 每個 chunk 可以有獨立的 embedding 向量
   - 支援向量相似度搜尋

2. **更好的引用系統**
   - 可以引用特定的筆記段落
   - 未來可以實現段落級別的連結

3. **靈活的分塊策略**
   - 當前：每個筆記一個 chunk
   - 未來：可以根據標題、段落等智能分塊

4. **性能優化**
   - 列出筆記時可以只查詢元資料
   - 只在需要時才載入完整內容

### 遷移指南

如果你有現有的資料庫：

1. **備份資料**
   ```sql
   -- 導出現有筆記
   SELECT * FROM notes;
   ```

2. **執行 Schema 變更**
   ```sql
   -- 移除 content 欄位
   ALTER TABLE notes DROP COLUMN IF EXISTS content;
   ```

3. **遷移現有內容到 chunks**
   ```sql
   -- 將現有內容遷移到 note_chunks（如果 notes 表仍有 content）
   INSERT INTO note_chunks (id, note_id, chunk_index, content, char_count)
   SELECT 
     gen_random_uuid()::text,
     id,
     0,
     content,
     length(content)
   FROM notes
   WHERE content IS NOT NULL;
   ```

### 向後兼容性

- ✅ 前端 API 客戶端保持不變
- ✅ 筆記對象格式保持不變（仍包含 content 欄位）
- ✅ 現有的遷移工具繼續工作
- ⚠️ 直接查詢資料庫的工具需要更新

### 測試建議

1. 創建新筆記
2. 讀取筆記內容
3. 更新筆記內容
4. 搜尋筆記
5. 刪除筆記
6. 驗證多個 chunks 的合併邏輯

### 未來計劃

- [ ] 實現智能分塊（按標題、段落）
- [ ] 為每個 chunk 生成 embeddings
- [ ] 實現語義搜尋 API
- [ ] 支援段落級別的引用
- [ ] 添加 chunk 摘要生成
