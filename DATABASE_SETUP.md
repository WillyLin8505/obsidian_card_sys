# 資料庫設置指南

本應用已配置為使用 Supabase 作為資料庫後端。請按照以下步驟完成設置：

## 步驟 1：執行資料庫遷移

1. 打開 Supabase 控制台
2. 進入 SQL Editor：https://supabase.com/dashboard/project/hhomwbsgcimvlgdbtbis/sql
3. 複製 `/supabase/migrations/001_knowledge_base_schema.sql` 文件的內容
4. 貼到 SQL Editor 中並執行

這將創建以下表：
- `notes` - 主筆記表（元資料，不包含內容）
- `note_chunks` - 筆記分塊（用於語義搜尋和存儲內容）
- `tags` / `note_tags` - 標籤系統
- `entities` / `note_entities` / `chunk_entities` - 實體抽取
- `note_links` - 筆記連結（卡片盒網絡）
- `sources` - 文獻來源
- `attachments` - 附件管理
- `sync_log` - 同步日誌
- `processing_jobs` - AI 處理任務追蹤

## 步驟 2：驗證資料庫

執行 SQL 後，檢查以下內容：

1. 確認所有表都已創建
2. 檢查 pgvector 擴展是否啟用（用於向量搜尋）
3. 確認 Row Level Security (RLS) 策略已創建

## 步驟 3：遷移現有資料（可選）

如果您之前使用 localStorage 存儲筆記：

1. 進入應用的「設定」頁面
2. 點擊「下載備份」以備份現有資料
3. 點擊「遷移到 Supabase」將資料上傳到資料庫

## 架構說明

### 重要變更：內容存儲架構

**關鍵架構決策**：筆記內容現在存儲在 `note_chunks` 表而不是 `notes` 表。

- **`notes` 表**：只存儲元資料（標題、類型、來源URL、時間戳等）
- **`note_chunks` 表**：存儲實際的筆記內容

這種設計的優勢：
1. 支援語義搜尋：每個 chunk 可以有自己的 embedding 向量
2. 更好的引用：可以引用特定的筆記段落
3. 靈活的分塊策略：未來可以實現智能分塊
4. 性能優化：不需要內容時可以只查詢 notes 表

### 三層儲存架構

1. **Markdown 文件**（計劃中）
   - 筆記正文
   - 使用者可直接編輯
   - 存儲實際內容

2. **PostgreSQL（Supabase）**
   - 筆記元資料
   - 標籤和實體
   - 筆記關聯
   - 全文搜尋索引（FTS）
   
3. **向量資料庫（pgvector）**
   - Chunk embeddings
   - Note embeddings
   - 語義搜尋功能

### API 端點

後端提供以下 API：

**筆記管理**
- `GET /notes` - 獲取所有筆記
- `GET /notes/:id` - 獲取單個筆記
- `POST /notes` - 創建新筆記
- `PUT /notes/:id` - 更新筆記
- `DELETE /notes/:id` - 刪除筆記（軟刪除）
- `GET /notes/search?q=<query>&type=<type>` - 搜尋筆記

**連結管理**
- `POST /links` - 創建筆記連結
- `GET /links/note/:noteId` - 獲取筆記的所有連結
- `DELETE /links/:linkId` - 刪除連結
- `PUT /links/:linkId/status` - 接受/拒絕建議的連結

## 下一步開發

以下功能尚待實現：

### 1. AI 聊天功能（Chat with Knowledge Base）
- 在「所有檔案與搜尋」頁面添加聊天介面
- 使用 RAG（檢索增強生成）
- 顯示引用的筆記來源
- 可將回答保存為新筆記

### 2. 語義搜尋
- 使用 OpenAI embeddings 生成向量
- pgvector 相似度搜尋
- 混合搜尋（關鍵字 + 語義）

### 3. 筆記分塊（Chunking）
- 自動將長筆記分成小塊
- 提取標題路徑
- 生成摘要和關鍵字

### 4. 實體抽取
- 識別概念、人物、書籍、工具等
- 建立實體圖譜
- 跨筆記關聯

### 5. 智能連結建議
- 基於語義相似度
- 基於共同實體
- 用戶可接受或拒絕建議

### 6. Mind Map 視覺化增強
- 顯示實體關係
- 顯示連結類型（supports, contrasts, extends 等）
- 互動式探索

## 技術堆疊

- **前端**: React + TypeScript + Tailwind CSS
- **路由**: React Router
- **資料庫**: Supabase (PostgreSQL + pgvector)
- **後端**: Deno + Hono
- **向量搜尋**: pgvector
- **AI 處理**: OpenAI API（待實現）

## 問題排查

### 無法連接到資料庫
- 檢查 Supabase 項目是否啟動
- 確認 `/utils/supabase/info.tsx` 中的配置正確
- 檢查瀏覽器控制台的錯誤訊息

### 遷移失敗
- 確保資料庫表已正確創建
- 檢查後端日誌（Supabase Functions Logs）
- 驗證 RLS 策略是否正確設置

### API 請求失敗
- 檢查網絡連接
- 確認 CORS 設置正確
- 查看後端函數日誌

## 聯繫支持

如有問題，請檢查：
- Supabase 控制台的 Logs 頁面
- 瀏覽器開發者工具的 Console
- Network 標籤中的 API 請求詳情