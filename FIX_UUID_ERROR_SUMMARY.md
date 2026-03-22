# UUID 錯誤修復總結

## 問題
```
Error creating note via API: Error: invalid input syntax for type uuid: "note_20260321T032912_i8yo7l"
Failed to create note: Error: invalid input syntax for type uuid: "note_20260321T032912_i8yo7l"
```

## 根本原因
1. 資料庫中的表結構使用 **UUID** 類型作為主鍵
2. 後端代碼生成的是 **自定義文字格式** 的 ID（如 `note_20260321T032912_i8yo7l`）
3. PostgreSQL 無法將自定義文字 ID 插入到 UUID 類型的欄位中

## 解決方案
將所有 ID 生成邏輯統一為標準的 **UUID v4** 格式。

## 已修改的文件

### 1. `/supabase/functions/server/db.tsx`
**變更：** 修改 `generateId()` 函數使用標準 UUID

```typescript
// 修改前
export const generateId = (prefix: string) => {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
};

// 修改後
export const generateId = (_prefix?: string) => {
  // Generate a standard UUID v4
  return crypto.randomUUID();
};
```

### 2. `/supabase/migrations/001_knowledge_base_schema.sql`
**變更：** 將所有 TEXT 類型的 ID 改為 UUID，並添加 `DEFAULT gen_random_uuid()`

主要變更：
- `notes.id`: `TEXT PRIMARY KEY` → `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `note_chunks.id`: `TEXT PRIMARY KEY` → `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `note_chunks.note_id`: `TEXT NOT NULL REFERENCES` → `UUID NOT NULL REFERENCES`
- `entities.id`: `TEXT PRIMARY KEY` → `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `note_links.id`: `TEXT PRIMARY KEY` → `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `sources.id`: `TEXT PRIMARY KEY` → `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `attachments.id`: `TEXT PRIMARY KEY` → `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `processing_jobs.id`: `TEXT PRIMARY KEY` → `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- 所有 foreign key 也相應改為 UUID 類型

### 3. `/supabase/functions/server/init.tsx`
**變更：** 修復重置資料庫時的刪除條件（UUID 不能與空字串比較）

```typescript
// 修改前
await supabase.from("notes").delete().neq("id", "");

// 修改後
await supabase.from("notes").delete().gt("id", "00000000-0000-0000-0000-000000000000");
```

### 4. `/src/app/pages/DatabaseMigration.tsx`
**變更：** 更新內嵌的 SQL schema 腳本，與主 migration 文件保持一致

- 所有 ID 欄位改為 UUID
- 添加 `DEFAULT gen_random_uuid()`
- 移除 notes 表中的 content 欄位（內容已遷移到 note_chunks）
- 新增全文搜尋索引

## 影響範圍

### ✅ 不受影響的部分
- **前端代碼**：前端使用空字串作為臨時 ID，由後端生成真正的 ID，無需修改
- **API 接口**：API 接口保持不變，只是返回的 ID 格式變為 UUID
- **業務邏輯**：筆記創建、更新、刪除、連結等邏輯完全不變

### ⚠️ 需要注意的部分
- **現有資料**：如果資料庫中有使用舊 ID 格式的資料，需要重新初始化資料庫
- **ID 格式**：新的筆記 ID 格式為標準 UUID（如 `123e4567-e89b-12d3-a456-426614174000`）

## 用戶操作步驟

### 方案 A：重新創建資料庫（推薦用於測試環境）

1. 前往應用中的「資料庫遷移與初始化」頁面
2. 點擊「重置資料庫」清空所有舊資料
3. 點擊「複製腳本」複製 SQL
4. 點擊「開啟 SQL Editor」前往 Supabase
5. 執行 DROP TABLE 語句刪除舊表：
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
6. 貼上並執行複製的 SQL 腳本
7. 返回應用，點擊「檢查資料庫」確認初始化成功
8. 測試創建筆記功能

### 方案 B：保留現有資料（如果資料庫已經是 UUID）

如果您的資料庫中的 ID 欄位已經是 UUID 類型：
1. 無需執行任何 SQL
2. 刷新應用頁面
3. 直接測試創建筆記功能

檢查當前資料庫 ID 類型：
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'notes' AND column_name = 'id';
```

## 測試清單

完成修復後，請測試以下功能：

- [ ] 創建閃念筆記
- [ ] 創建文獻筆記
- [ ] 創建永久筆記
- [ ] 編輯現有筆記
- [ ] 刪除筆記
- [ ] 添加筆記連結
- [ ] 搜尋筆記
- [ ] 查看筆記詳情

## 技術優勢

使用 UUID 代替自定義 ID 的好處：
1. **資料庫標準**：UUID 是 PostgreSQL 原生支持的類型
2. **索引優化**：資料庫對 UUID 類型有專門的索引優化
3. **唯一性保證**：UUID 保證全局唯一，不需要額外的邏輯
4. **分散式系統**：適合未來的分散式部署
5. **安全性**：UUID 不會洩露創建時間等敏感信息

## 額外文檔

詳細的遷移指南請參閱：`/UUID_MIGRATION_GUIDE.md`
