# UUID 遷移指南

## 問題描述
您遇到的錯誤是：`Error: invalid input syntax for type uuid: "note_20260321T032912_i8yo7l"`

這是因為資料庫中的表結構使用 UUID 類型，但舊版本的後端代碼生成的是自定義文字格式的 ID。

## 解決方案
我已經更新了代碼，現在後端會生成標準的 UUID v4 格式的 ID。

## 遷移步驟

### 選項 1：重新創建表（推薦，適用於測試環境）

如果您的資料庫中沒有重要數據，最簡單的方法是重新創建所有表：

1. 前往 Supabase SQL Editor：
   ```
   https://supabase.com/dashboard/project/hhomwbsgcimvlgdbtbis/sql
   ```

2. 執行以下 SQL 刪除所有現有表：
   ```sql
   DROP TABLE IF EXISTS processing_jobs CASCADE;
   DROP TABLE IF EXISTS sync_log CASCADE;
   DROP TABLE IF EXISTS attachments CASCADE;
   DROP TABLE IF EXISTS sources CASCADE;
   DROP TABLE IF EXISTS note_links CASCADE;
   DROP TABLE IF EXISTS chunk_entities CASCADE;
   DROP TABLE IF EXISTS note_entities CASCADE;
   DROP TABLE IF EXISTS entities CASCADE;
   DROP TABLE IF EXISTS note_tags CASCADE;
   DROP TABLE IF EXISTS tags CASCADE;
   DROP TABLE IF EXISTS note_chunks CASCADE;
   DROP TABLE IF EXISTS notes CASCADE;
   ```

3. 複製並執行 `/supabase/migrations/001_knowledge_base_schema.sql` 中的完整 SQL schema

4. 刷新應用頁面並測試創建筆記功能

### 選項 2：保留現有資料（適用於生產環境）

如果您的資料庫中有重要數據需要保留：

1. 前往 Supabase SQL Editor

2. 檢查當前表結構（已經是 UUID 就不需要遷移）：
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'notes' AND column_name = 'id';
   ```

3. 如果顯示 `uuid`，則表示資料庫結構已經正確，只需要更新代碼即可（已完成）

4. 刷新應用頁面並測試功能

## 已更新的文件

1. `/supabase/functions/server/db.tsx` - 修改 `generateId()` 函數生成標準 UUID
2. `/supabase/migrations/001_knowledge_base_schema.sql` - 更新所有 ID 欄位為 UUID 類型
3. `/supabase/functions/server/init.tsx` - 修復刪除操作的條件判斷

## 測試

更新後，您應該能夠：
- ✅ 創建新的閃念筆記
- ✅ 創建新的文獻筆記
- ✅ 創建新的永久筆記
- ✅ 所有筆記都會有標準的 UUID 格式（如：`123e4567-e89b-12d3-a456-426614174000`）

## 常見問題

**Q: 為什麼改用 UUID 而不是自定義 ID？**
A: UUID 是資料庫標準，提供更好的性能、索引支持和跨系統兼容性。

**Q: 舊的筆記怎麼辦？**
A: 如果您選擇選項 1（重新創建表），舊數據會被刪除。如果選擇選項 2，舊數據會保留，但新筆記會使用 UUID。

**Q: 能否同時支持兩種 ID 格式？**
A: 不建議。混合使用會導致查詢複雜化和性能問題。建議統一使用 UUID。
