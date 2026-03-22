# User ID 問題修復摘要

## 🔍 問題描述

您遇到的錯誤：
```
null value in column "user_id" of relation "notes" violates not-null constraint
```

**根本原因**：
- 資料庫 schema 要求所有表（`notes`, `note_chunks`, `tags`, `note_links`）都必須有 `user_id` 字段
- 但後端代碼在創建記錄時沒有設置 `user_id`
- 後端使用 `SUPABASE_SERVICE_ROLE_KEY`，繞過了 RLS（行級安全），但仍需遵守 NOT NULL 約束

## ✅ 解決方案

我們實現了一個**系統用戶**方案，適合開發和原型階段：

### 1. 創建系統用戶支持 (`/supabase/functions/server/db.tsx`)

```typescript
// 固定的系統用戶 UUID
export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

// 從請求獲取用戶 ID，或使用系統用戶
export const getUserId = async (authHeader?: string): Promise<string> => {
  // 嘗試從 Authorization header 獲取
  if (authHeader && authHeader.startsWith("Bearer ")) {
    // ... 驗證邏輯
  }
  // 否則返回系統用戶 ID
  return SYSTEM_USER_ID;
};

// 自動創建系統用戶
export const ensureSystemUser = async () => {
  // 檢查並創建 system@zettelkasten.local 用戶
};
```

### 2. 服務器啟動時初始化 (`/supabase/functions/server/index.tsx`)

```typescript
import { ensureSystemUser } from "./db.tsx";

// 在服務器啟動時確保系統用戶存在
ensureSystemUser().catch(console.error);
```

### 3. 所有數據操作都包含 `user_id`

#### 創建筆記 (`notes.tsx`)
```typescript
const userId = await getUserId(c.req.header("Authorization"));

// 插入筆記
await supabase.from("notes").insert({
  id: noteId,
  user_id: userId,  // ✅ 添加
  // ... 其他字段
});

// 插入 chunk
await supabase.from("note_chunks").insert({
  id: chunkId,
  note_id: noteId,
  user_id: userId,  // ✅ 添加
  // ... 其他字段
});
```

#### 創建標籤
```typescript
await supabase.from("tags").insert({ 
  name: tagName,
  user_id: userId,  // ✅ 添加
});
```

#### 創建連結 (`links.tsx`)
```typescript
await supabase.from("note_links").insert({
  id: linkId,
  user_id: userId,  // ✅ 添加
  from_note_id: fromNoteId,
  to_note_id: toNoteId,
  // ... 其他字段
});
```

#### 查詢數據時過濾用戶
```typescript
// 只獲取當前用戶的數據
.eq("user_id", userId)
```

## 📊 修改的文件

1. **`/supabase/functions/server/db.tsx`**
   - ✅ 添加 `SYSTEM_USER_ID` 常量
   - ✅ 添加 `getUserId()` 函數
   - ✅ 添加 `ensureSystemUser()` 函數

2. **`/supabase/functions/server/index.tsx`**
   - ✅ 在啟動時調用 `ensureSystemUser()`

3. **`/supabase/functions/server/notes.tsx`**
   - ✅ 所有路由都使用 `getUserId()`
   - ✅ 創建筆記時設置 `user_id`
   - ✅ 創建 chunks 時設置 `user_id`
   - ✅ 創建/更新標籤時設置 `user_id`
   - ✅ 查詢時過濾 `user_id`

4. **`/supabase/functions/server/links.tsx`**
   - ✅ 創建連結時設置 `user_id`
   - ✅ 查詢時過濾 `user_id`

## 🎯 現在可以做什麼

### 立即測試
1. 訪問 `/diagnostic-test` 頁面
2. 點擊「開始測試」按鈕
3. 所有 9 項測試應該都通過 ✅

### 系統會自動：
- ✅ 在首次運行時創建系統用戶
- ✅ 所有筆記都關聯到系統用戶 ID
- ✅ 所有操作都正常工作

## 🔮 未來升級路徑

當您準備好實現真實的用戶認證時：

### 方案 A：匿名用戶（簡單）
```typescript
const { data: { user } } = await supabase.auth.signInAnonymously();
```

### 方案 B：Email/密碼登錄
```typescript
const { data: { user } } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password',
});
```

### 方案 C：社交登錄（Google, GitHub 等）
```typescript
const { data: { user } } = await supabase.auth.signInWithOAuth({
  provider: 'google',
});
```

**重要**：現有的 `getUserId()` 函數已經支持從 Authorization header 獲取真實用戶，所以只需要：
1. 在前端實現登錄/註冊 UI
2. 在登錄後存儲 access_token
3. 在 API 請求中傳遞 token
4. 系統會自動使用真實用戶 ID

## 💡 架構優勢

這個方案的好處：
- ✅ **向後兼容**：未來可以平滑升級到多用戶
- ✅ **RLS 友好**：保持了行級安全策略
- ✅ **開發便利**：無需登錄即可開發和測試
- ✅ **數據隔離**：為真實多用戶做好準備

## ⚠️ 注意事項

1. **系統用戶 ID 是固定的**：`00000000-0000-0000-0000-000000000001`
2. **開發階段使用**：所有數據都屬於這個系統用戶
3. **生產環境**：需要實現真實的用戶認證
4. **數據遷移**：如果以後要切換到多用戶，需要遷移現有數據

## 🧪 驗證步驟

1. ✅ 運行系統診斷測試
2. ✅ 創建新筆記
3. ✅ 更新筆記
4. ✅ 創建連結
5. ✅ 搜尋筆記
6. ✅ 刪除筆記

所有操作現在都應該正常工作！

---

**修復日期**：2026-03-21  
**狀態**：✅ 已完成並可以測試
