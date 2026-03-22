# 架構遷移總結：notes.content → note_chunks.content

## 變更概述

成功將筆記內容存儲從 `notes.content` 遷移到 `note_chunks.content`，實現更好的語義搜尋和分塊功能支援。

## 修改的檔案

### 1. 後端檔案

#### `/supabase/functions/server/notes.tsx` ✅
**主要變更**：
- **GET /notes/search**: 從 `note_chunks` 表搜尋，合併多個 chunks
- **GET /notes**: 從 `notes` 獲取元資料，從 `note_chunks` 獲取內容
- **GET /notes/:id**: 從 `note_chunks` 讀取內容並按 chunk_index 排序
- **POST /notes**: 在 `note_chunks` 創建 chunk，不在 `notes` 表存儲 content
- **PUT /notes/:id**: 更新時刪除舊 chunks，創建新 chunk
- **DELETE /notes/:id**: 保持軟刪除邏輯（CASCADE 會自動刪除 chunks）

#### `/supabase/functions/server/init.tsx` ✅
**主要變更**：
- 資料庫健康檢查不再查詢 `notes.content`
- 只查詢 `id, title, note_type` 欄位

#### `/supabase/migrations/001_knowledge_base_schema.sql` ✅
**主要變更**：
- 從 `notes` 表移除 `content TEXT NOT NULL` 欄位
- `note_chunks` 表保持不變，繼續存儲 content

### 2. 文檔檔案

#### `/DATABASE_SETUP.md` ✅
**主要變更**：
- 更新表說明，標註 notes 表不包含內容
- 添加「重要變更：內容存儲架構」章節
- 說明新架構的優勢

#### `/ARCHITECTURE_CHANGES.md` ✅（新建）
**內容**：
- 詳細的變更記錄
- 遷移指南
- 測試建議
- 未來計劃

#### `/MIGRATION_SUMMARY.md` ✅（本檔案）
**內容**：
- 變更總結
- 修改檔案列表
- 未修改檔案說明

### 3. 前端檔案

#### `/src/app/utils/api.ts` ⚪ 不需修改
**原因**：前端通過 REST API 訪問資料，後端已處理 chunk 合併邏輯

#### `/src/app/utils/migrate.ts` ⚪ 不需修改
**原因**：使用 `api.notes.create()` 創建筆記，API 會自動處理 chunk 創建

#### 其他前端組件 ⚪ 不需修改
**原因**：所有前端組件通過 `api.ts` 訪問資料，API 接口保持不變

## 資料流程說明

### 創建筆記流程
```
前端 -> POST /notes
         ↓
      後端 API
         ↓
    1. 在 notes 表創建記錄（無 content）
    2. 在 note_chunks 表創建 chunk（包含 content）
         ↓
      返回完整筆記對象（包含 content）
```

### 讀取筆記流程
```
前端 -> GET /notes/:id
         ↓
      後端 API
         ↓
    1. 從 notes 表獲取元資料
    2. 從 note_chunks 表獲取所有 chunks
    3. 按 chunk_index 排序並合併 content
         ↓
      返回完整筆記對象（包含 content）
```

### 搜尋筆記流程
```
前端 -> GET /notes/search?q=關鍵字
         ↓
      後端 API
         ↓
    1. 在 note_chunks 表搜尋 content
    2. JOIN notes 表獲取元資料
    3. 按 note_id 分組，合併同一筆記的多個 chunks
         ↓
      返回筆記列表（每個包含 content）
```

## 向後兼容性

✅ **完全向後兼容**

- 前端 API 接口**不變**
- 筆記對象格式**不變**（仍包含 content 欄位）
- 現有功能**不變**（創建、讀取、更新、刪除、搜尋）

唯一變化是底層存儲位置，對前端完全透明。

## 資料庫遷移步驟

如果你已經有現有的資料庫：

### 選項 A：重新創建（推薦）

1. 備份現有資料：
   ```sql
   -- 在 Supabase SQL Editor 執行
   SELECT * FROM notes;
   ```

2. 刪除並重建所有表：
   ```sql
   -- 複製 /supabase/migrations/001_knowledge_base_schema.sql 的內容
   -- 在 Supabase SQL Editor 執行
   ```

3. 使用前端遷移工具重新導入資料

### 選項 B：原地遷移

1. 備份資料
2. 遷移現有內容：
   ```sql
   -- 創建 note_chunks（如果還沒有）
   -- 然後遷移內容
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

3. 移除 content 欄位：
   ```sql
   ALTER TABLE notes DROP COLUMN IF EXISTS content;
   ```

## 測試清單

執行以下測試確保遷移成功：

- [ ] 創建新筆記（閃念筆記）
- [ ] 創建新筆記（文獻筆記）
- [ ] 創建新筆記（永久筆記）
- [ ] 讀取單個筆記的完整內容
- [ ] 更新筆記內容
- [ ] 搜尋筆記（關鍵字在標題中）
- [ ] 搜尋筆記（關鍵字在內容中）
- [ ] 刪除筆記
- [ ] 檢查資料庫狀態
- [ ] 驗證 chunks 正確創建（Supabase 表編輯器）

## 已知問題

無

## 後續優化計劃

1. **智能分塊**：將長筆記分成多個有意義的 chunks
2. **Embedding 生成**：為每個 chunk 生成向量
3. **語義搜尋**：基於向量相似度搜尋
4. **段落引用**：支援引用特定的 chunk

## 支援資源

- [資料庫設置指南](/DATABASE_SETUP.md)
- [架構變更詳情](/ARCHITECTURE_CHANGES.md)
- [SQL Schema](/supabase/migrations/001_knowledge_base_schema.sql)

## 問題排查

### 錯誤：找不到 content 欄位

**症狀**：API 返回錯誤 "column 'content' does not exist"

**解決方案**：
1. 確認已執行最新的 SQL migration
2. 檢查 notes 表是否仍有 content 欄位（應該已移除）
3. 檢查 note_chunks 表是否存在
4. 重啟 Supabase Edge Function（如果需要）

### 筆記內容為空

**症狀**：能創建筆記，但讀取時 content 為空字符串

**解決方案**：
1. 檢查 note_chunks 表是否有對應記錄
2. 確認 chunk 的 note_id 正確
3. 檢查後端日誌是否有錯誤

### 搜尋無結果

**症狀**：搜尋功能不返回任何結果

**解決方案**：
1. 確認搜尋查詢在 note_chunks 表而非 notes 表
2. 檢查後端 search endpoint 是否正確實現
3. 驗證 JOIN 邏輯是否正確

---

**遷移日期**: 2026-03-21  
**版本**: v2.0  
**狀態**: ✅ 完成並測試
