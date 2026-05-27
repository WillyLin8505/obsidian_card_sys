# Note → 連結筆記搜尋 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在「所有筆記」右鍵選單新增「找相關筆記」，點擊後跳轉到「連結筆記」並自動以該筆記標題搜尋相關筆記。

**Architecture:** 透過 React Router 的 `navigate(path, { state })` 將筆記標題傳遞到 PermanentNotes 頁面；PermanentNotes 在 mount 時讀取 `useLocation().state`，若有 `searchQuery` 就自動填入並執行搜尋。左鍵點擊維持原有開啟筆記的行為不變，「找相關筆記」由右鍵選單觸發。

**Tech Stack:** React, React Router v6, TypeScript

---

## File Map

| 檔案 | 變更類型 | 說明 |
|------|---------|------|
| `src/app/pages/AllFiles.tsx` | Modify | 右鍵選單新增「找相關筆記」選項 |
| `src/app/pages/PermanentNotes.tsx` | Modify | mount 時讀取 navigation state，自動觸發搜尋 |

---

### Task 1: AllFiles 右鍵選單新增「找相關筆記」

**Files:**
- Modify: `src/app/pages/AllFiles.tsx`

- [ ] **Step 1: 新增 handleFindRelated handler**

在 `AllFiles.tsx` 的 `handleDeleteSelected` 函式之前，新增：

```tsx
const handleFindRelated = () => {
  const noteIds = Array.from(selectedNotes);
  if (noteIds.length !== 1) return;
  const note = notes.find(n => n.id === noteIds[0]);
  if (!note) return;
  setContextMenu(null);
  navigate('/permanent-notes', { state: { searchQuery: note.title } });
};
```

- [ ] **Step 2: 右鍵選單加入按鈕**

找到右鍵選單的 JSX（`{contextMenu && (...)`），在刪除按鈕**之前**新增：

```tsx
<button
  className="w-full px-4 py-2 text-sm text-left text-blue-600 hover:bg-blue-50 rounded-t-lg transition-colors flex items-center gap-2"
  onClick={handleFindRelated}
>
  <Network className="size-4" />
  找相關筆記
</button>
```

- [ ] **Step 3: 補上 Network import**

確認 import 行包含 `Network`：

```tsx
import { Search, X, Loader2, Plus, Trash2, Sparkles, Network } from 'lucide-react';
```

- [ ] **Step 4: 手動測試右鍵選單**

1. 開啟「所有筆記」
2. 右鍵點擊任一筆記
3. 確認選單出現「找相關筆記」與「刪除」兩個選項

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/AllFiles.tsx
git commit -m "feat: add '找相關筆記' to AllFiles context menu"
```

---

### Task 2: PermanentNotes 接收 navigation state 並自動搜尋

**Files:**
- Modify: `src/app/pages/PermanentNotes.tsx`

- [ ] **Step 1: 引入 useLocation**

在 import 行新增 `useLocation`：

```tsx
import { useNavigate, useLocation } from 'react-router';
```

- [ ] **Step 2: 讀取 navigation state**

在 `PermanentNotes` 函式頂部 `useNavigate()` 之後加入：

```tsx
const location = useLocation();
```

- [ ] **Step 3: mount 時自動觸發搜尋**

在現有的 `useEffect(() => { loadNotes(); }, []);` **之後**新增：

```tsx
useEffect(() => {
  const state = location.state as { searchQuery?: string } | null;
  if (state?.searchQuery) {
    setSearchQuery(state.searchQuery);
  }
}, [location.state]);
```

- [ ] **Step 4: searchQuery 有值時自動執行搜尋**

修改現有搜尋的 `useEffect`（或新增），在 `loading` 完成且 `searchQuery` 有值時自動搜尋：

```tsx
useEffect(() => {
  if (!loading && searchQuery && searchResults === null) {
    handleSearch();
  }
}, [loading, searchQuery]);
```

注意：`handleSearch` 需確保在此 effect 之前已定義（目前已定義，無需移動）。

- [ ] **Step 5: 手動端對端測試**

1. 在「所有筆記」右鍵點擊一則筆記
2. 點選「找相關筆記」
3. 確認跳轉到「連結筆記」
4. 確認搜尋欄已填入該筆記標題
5. 確認搜尋自動執行，顯示相關筆記

- [ ] **Step 6: Commit**

```bash
git add src/app/pages/PermanentNotes.tsx
git commit -m "feat: auto-search on navigate from AllFiles to 連結筆記"
```
