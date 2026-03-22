# UUID 錯誤快速修復指南

## 🚨 遇到錯誤
```
Error: invalid input syntax for type uuid: "note_20260321T032912_i8yo7l"
```

## ✅ 已自動修復
所有後端代碼已更新為使用標準 UUID 格式。

## 📋 您需要做的（2 分鐘）

### 步驟 1：前往 Supabase SQL Editor
點擊這個連結：https://supabase.com/dashboard/project/hhomwbsgcimvlgdbtbis/sql

### 步驟 2：刪除舊表
複製並執行以下 SQL：

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

### 步驟 3：創建新表
在應用中：
1. 前往「資料庫遷移與初始化」頁面
2. 點擊「複製腳本」
3. 在 Supabase SQL Editor 中貼上並執行

### 步驟 4：測試
返回應用，創建一個新筆記測試是否成功！

## 📚 詳細文檔
- 完整修復說明：`/FIX_UUID_ERROR_SUMMARY.md`
- 遷移指南：`/UUID_MIGRATION_GUIDE.md`

## ❓ 常見問題

**Q: 我的舊筆記怎麼辦？**
A: 重新創建表會刪除所有舊數據。如果有重要數據，請先備份。

**Q: 為什麼要用 UUID？**
A: UUID 是資料庫標準格式，提供更好的性能和兼容性。

**Q: 需要修改前端代碼嗎？**
A: 不需要！前端代碼完全兼容，無需任何修改。
