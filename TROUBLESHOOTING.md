# 🔧 問題排查指南

## 快速診斷流程

```
1. 訪問 /diagnostic-test 運行自動診斷
   ↓
2. 查看失敗的測試項目
   ↓
3. 根據下方指南解決問題
   ↓
4. 重新運行測試驗證修復
```

## 🚨 常見錯誤速查表

### 錯誤 1: `invalid input syntax for type uuid`

**症狀**:
- 無法創建新筆記
- 報錯 "invalid input syntax for type uuid"
- 或 "invalid UUID format"

**原因**:
- 資料庫表仍使用舊的 schema（TEXT 類型而非 UUID）
- 或代碼嘗試使用舊格式的 ID

**解決方案**:
1. 前往 Supabase SQL Editor
2. 執行以下命令重置資料庫：
   ```sql
   -- 刪除舊表
   DROP TABLE IF EXISTS note_links CASCADE;
   DROP TABLE IF EXISTS note_tags CASCADE;
   DROP TABLE IF EXISTS note_chunks CASCADE;
   DROP TABLE IF EXISTS sources CASCADE;
   DROP TABLE IF EXISTS attachments CASCADE;
   DROP TABLE IF EXISTS notes CASCADE;
   DROP TABLE IF EXISTS tags CASCADE;
   ```
3. 複製 `/supabase/migrations/001_knowledge_base_schema.sql` 的全部內容
4. 在 SQL Editor 中執行該腳本
5. 在應用中點擊「重新檢查」

---

### 錯誤 2: `relation "notes" does not exist`

**症狀**:
- 資料庫連接失敗
- 無法獲取任何筆記
- 報錯 "relation does not exist"

**原因**:
- 資料庫表尚未創建
- SQL 遷移腳本未執行

**解決方案**:
1. 前往「資料庫管理」頁面
2. 點擊「開啟 SQL Editor」
3. 執行 `/supabase/migrations/001_knowledge_base_schema.sql`
4. 返回應用，點擊「重新檢查」

---

### 錯誤 3: `column "content" does not exist`

**症狀**:
- 無法獲取筆記內容
- 報錯 "column content does not exist"

**原因**:
- 使用了舊版本的 SQL schema
- `notes` 表不應該有 `content` 欄位（內容存儲在 `note_chunks` 表中）

**解決方案**:
1. 檢查後端代碼是否正確使用 `note_chunks` 表
2. 如果表結構錯誤，重新執行最新的 SQL 遷移腳本
3. 確保使用的是 `/supabase/migrations/001_knowledge_base_schema.sql`

---

### 錯誤 4: 創建筆記成功但看不到內容

**症狀**:
- 筆記創建成功
- 筆記列表中可以看到標題
- 但打開筆記時內容為空

**原因**:
- `note_chunks` 表沒有正確創建內容
- 或獲取內容的查詢有問題

**解決方案**:
1. 在 Supabase SQL Editor 中檢查：
   ```sql
   -- 查看筆記和對應的 chunks
   SELECT n.id, n.title, c.content
   FROM notes n
   LEFT JOIN note_chunks c ON n.id = c.note_id
   LIMIT 5;
   ```
2. 如果沒有 chunks 數據，檢查後端創建筆記的代碼
3. 確保 `note_chunks.insert` 正確執行

---

### 錯誤 5: UUID 格式驗證失敗

**症狀**:
- 診斷測試顯示「發現 X 個無效的 UUID」
- 筆記 ID 不是標準 UUID 格式

**原因**:
- 資料庫中還有遷移前創建的舊筆記
- 舊筆記使用自定義 ID 格式（如 `note_20260321_xxx`）

**解決方案**:

**選項 A - 清空資料庫（推薦用於開發/測試）**:
1. 前往「資料庫管理」頁面
2. 點擊「清空資料庫」
3. 確認操作
4. 重新創建筆記

**選項 B - 數據遷移（保留現有數據）**:
1. 導出現有筆記數據
2. 清空資料庫
3. 使用新的 API 重新導入筆記

---

### 錯誤 6: 搜尋功能不工作

**症狀**:
- 搜尋沒有返回結果
- 或搜尋報錯

**原因**:
- `note_chunks` 表沒有內容
- 搜尋查詢語法錯誤

**解決方案**:
1. 檢查 `note_chunks` 表：
   ```sql
   SELECT COUNT(*) FROM note_chunks;
   ```
2. 如果為 0，檢查創建筆記時是否正確插入 chunks
3. 運行診斷測試檢查具體錯誤

---

### 錯誤 7: 更新筆記後標籤丟失

**症狀**:
- 更新筆記後，標籤消失
- 或無法添加新標籤

**原因**:
- 後端更新筆記時沒有正確處理標籤
- 或返回的數據不完整

**解決方案**:
已在最新代碼中修復，確保：
1. 後端代碼已更新到最新版本
2. 更新筆記 API 正確返回標籤數據
3. 前端正確處理返回的標籤

---

### 錯誤 8: 筆記連結功能異常

**症狀**:
- 無法創建筆記之間的連結
- 或連結顯示不正確

**原因**:
- `note_links` 表沒有正確創建
- 或 ID 格式不匹配

**解決方案**:
1. 檢查 `note_links` 表：
   ```sql
   SELECT * FROM note_links LIMIT 5;
   ```
2. 確保 `from_note_id` 和 `to_note_id` 都是有效的 UUID
3. 運行診斷測試中的「創建連結測試」

---

### 錯誤 9: 資料庫連接超時

**症狀**:
- 請求長時間沒有響應
- 最終超時錯誤

**原因**:
- Supabase 項目暫停或達到限額
- 網絡連接問題
- API endpoint 錯誤

**解決方案**:
1. 檢查 Supabase Dashboard，確認項目狀態
2. 驗證 API URL 和密鑰是否正確
3. 檢查瀏覽器控制台的網絡請求

---

## 🔍 診斷步驟

### 步驟 1: 運行自動診斷
```
訪問: /diagnostic-test
點擊: 開始測試
等待: 所有測試完成
```

### 步驟 2: 查看瀏覽器控制台
1. 按 F12 打開開發者工具
2. 切換到 Console 標籤
3. 查找紅色錯誤消息
4. 記錄完整的錯誤堆棧

### 步驟 3: 檢查網絡請求
1. 開發者工具中切換到 Network 標籤
2. 重現問題
3. 查看失敗的請求
4. 點擊請求查看：
   - Request Headers
   - Request Payload
   - Response

### 步驟 4: 檢查 Supabase 日誌
1. 前往 Supabase Dashboard
2. Project > Logs > Edge Functions
3. 查找對應時間的錯誤
4. 記錄錯誤詳情

### 步驟 5: 驗證資料庫狀態
在 SQL Editor 中運行：
```sql
-- 1. 檢查所有表是否存在
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- 2. 檢查 notes 表結構
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'notes';

-- 3. 檢查數據
SELECT COUNT(*) as total_notes FROM notes;
SELECT COUNT(*) as total_chunks FROM note_chunks;
SELECT COUNT(*) as total_tags FROM tags;
SELECT COUNT(*) as total_links FROM note_links;
```

---

## 🛠️ 快速修復腳本

### 完全重置資料庫
```sql
-- ⚠️ 警告：這將刪除所有數據！

-- 1. 刪除所有表
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

-- 2. 然後執行完整的 schema
-- 複製 /supabase/migrations/001_knowledge_base_schema.sql 的內容並執行
```

### 清空數據但保留表結構
```sql
-- 保留表結構，只刪除數據
TRUNCATE TABLE note_links CASCADE;
TRUNCATE TABLE note_tags CASCADE;
TRUNCATE TABLE note_chunks CASCADE;
TRUNCATE TABLE sources CASCADE;
TRUNCATE TABLE attachments CASCADE;
TRUNCATE TABLE notes CASCADE;
TRUNCATE TABLE tags CASCADE;
TRUNCATE TABLE entities CASCADE;
```

---

## 📞 獲取幫助

如果問題仍未解決，請：

1. **運行診斷測試**並截圖結果
2. **複製錯誤消息**（完整的堆棧追蹤）
3. **檢查相關文檔**：
   - `/DIAGNOSTIC_GUIDE.md`
   - `/VERIFICATION_CHECKLIST.md`
   - `/UUID_MIGRATION_GUIDE.md`
4. **查看資料庫日誌**（Supabase Dashboard）

---

## ✅ 驗證修復成功

修復後，確認：
- [ ] 診斷測試全部通過（9/9）
- [ ] 可以創建新筆記
- [ ] 可以編輯現有筆記
- [ ] 可以添加標籤
- [ ] 可以創建筆記連結
- [ ] 搜尋功能正常
- [ ] 所有筆記 ID 都是 UUID 格式

---

**最後更新**: 2026-03-21
