# UUID 修復驗證清單

完成資料庫遷移後，請按照此清單測試所有功能。

## 🔧 後端修復驗證

### 1. ID 生成格式
- [ ] 新創建的筆記 ID 格式為 UUID（如 `a1b2c3d4-e5f6-7890-abcd-ef1234567890`）
- [ ] 不再出現舊格式的 ID（如 `note_20260321T032912_i8yo7l`）

### 2. 資料庫連接
- [ ] 前往「資料庫遷移與初始化」頁面
- [ ] 點擊「檢查資料庫」按鈕
- [ ] 顯示「✅ 資料庫 schema 已正確初始化！」

### 3. 資料庫表結構
在 Supabase SQL Editor 中執行：
```sql
-- 檢查 notes 表的 id 類型
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'notes' AND column_name = 'id';

-- 應該返回：id | uuid
```

## 📝 筆記創建測試

### 閃念筆記 (Fleet Notes)
- [ ] 前往「閃念筆記」頁面
- [ ] 點擊「新增閃念筆記」
- [ ] 成功創建筆記，沒有錯誤
- [ ] 筆記 ID 為 UUID 格式
- [ ] 筆記內容可正常編輯和保存

### 文獻筆記 (Source Notes)
- [ ] 前往「文獻筆記」頁面
- [ ] 點擊「新增文獻筆記」
- [ ] 成功創建筆記，沒有錯誤
- [ ] 可添加來源 URL
- [ ] 筆記內容可正常編輯和保存

### 永久筆記 (Permanent Notes)
- [ ] 前往「永久筆記」頁面
- [ ] 點擊「新增永久筆記」
- [ ] 成功創建筆記，沒有錯誤
- [ ] 筆記內容可正常編輯和保存

## 🔗 功能測試

### 筆記編輯
- [ ] 打開任一筆記
- [ ] 修改標題和內容
- [ ] 點擊保存
- [ ] 刷新頁面，修改已保存

### 標籤管理
- [ ] 在筆記中添加標籤
- [ ] 標籤正確顯示在筆記卡片上
- [ ] 可以刪除標籤

### 筆記連結
- [ ] 在永久筆記中添加雙向連結
- [ ] 連結正確顯示
- [ ] 點擊連結可跳轉到目標筆記
- [ ] Mind Map 視覺化正常顯示連結

### 搜尋功能
- [ ] 前往「所有檔案」頁面
- [ ] 在搜尋框輸入關鍵字
- [ ] 搜尋結果正確顯示
- [ ] 可按類型篩選（閃念/文獻/永久）

### 刪除功能
- [ ] 創建一個測試筆記
- [ ] 刪除該筆記
- [ ] 筆記從列表中消失
- [ ] 資料庫中該筆記被軟刪除（status = 'deleted'）

## 🗄️ 資料庫完整性測試

在 Supabase SQL Editor 中執行：

```sql
-- 1. 檢查所有筆記都有對應的 chunk
SELECT COUNT(*) FROM notes WHERE id NOT IN (SELECT DISTINCT note_id FROM note_chunks);
-- 應該返回 0

-- 2. 檢查沒有孤立的 chunks
SELECT COUNT(*) FROM note_chunks WHERE note_id NOT IN (SELECT id FROM notes);
-- 應該返回 0

-- 3. 檢查沒有孤立的標籤關聯
SELECT COUNT(*) FROM note_tags WHERE note_id NOT IN (SELECT id FROM notes);
-- 應該返回 0

-- 4. 檢查沒有孤立的筆記連結
SELECT COUNT(*) FROM note_links 
WHERE from_note_id NOT IN (SELECT id FROM notes) 
   OR to_note_id NOT IN (SELECT id FROM notes);
-- 應該返回 0

-- 5. 查看範例筆記的完整結構
SELECT 
    n.id,
    n.title,
    n.note_type,
    c.content,
    array_agg(DISTINCT t.name) as tags
FROM notes n
LEFT JOIN note_chunks c ON n.id = c.note_id
LEFT JOIN note_tags nt ON n.id = nt.note_id
LEFT JOIN tags t ON nt.tag_id = t.id
WHERE n.status = 'active'
GROUP BY n.id, n.title, n.note_type, c.content
LIMIT 3;
```

## 🎯 性能測試

### 批量創建
- [ ] 連續創建 10 個筆記
- [ ] 每個筆記都能成功創建
- [ ] 沒有 ID 衝突錯誤
- [ ] 響應時間正常（< 2 秒）

### 大量資料查詢
- [ ] 在有多個筆記的情況下，列表頁面加載正常
- [ ] 搜尋響應迅速
- [ ] Mind Map 可視化不卡頓

## ⚠️ 常見問題排查

### 如果仍然看到錯誤...

**錯誤：`invalid input syntax for type uuid`**
- 檢查是否已執行 DROP TABLE 語句
- 檢查是否已執行新的 CREATE TABLE 語句
- 嘗試清除瀏覽器緩存並刷新頁面

**錯誤：`relation "notes" does not exist`**
- 資料庫表尚未創建
- 前往「資料庫遷移與初始化」頁面執行 SQL 腳本

**錯誤：`column "content" does not exist`**
- 您可能執行了舊版本的 SQL
- 重新執行 DROP TABLE 和新的 CREATE TABLE 語句

**創建筆記成功，但看不到內容**
- 檢查 note_chunks 表是否有數據
- 執行：`SELECT * FROM note_chunks LIMIT 5;`

## ✅ 驗證完成

所有測試通過後，您的系統已完全升級到 UUID 架構！

### 下一步建議
1. 測試更複雜的工作流程（批量標籤、複雜連結等）
2. 備份資料庫（Supabase Dashboard > Database > Backups）
3. 考慮實施定期備份策略
4. 監控錯誤日誌，及時發現問題

---

**需要幫助？** 查看詳細文檔：
- `/FIX_UUID_ERROR_SUMMARY.md` - 完整修復說明
- `/UUID_MIGRATION_GUIDE.md` - 遷移指南
- `/QUICK_FIX.md` - 快速修復步驟
