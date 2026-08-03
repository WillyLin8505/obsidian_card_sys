# Multiple Obsidian Vaults Design Spec

**Date:** 2026-08-03
**Feature:** 在設定頁管理多個 Obsidian Vault 路徑，並可選擇 active vault 一次使用一個

---

## Goal

使用者有多個獨立的 Obsidian Vault（例如「工作」「個人」「專案」）。目前系統只支援單一 `notePath`。本功能讓使用者在**設定頁**維護一份 Vault 清單，每個 Vault 記住自己的名稱、Vault 路徑、文獻筆記存檔路徑，並選擇其中一個為 active。切換 active 後，全 App 的筆記操作即改用該 Vault 的路徑。一次只用一個 Vault。

切換入口只放在設定頁，不做主畫面常駐切換器（YAGNI）。

---

## Design Approach

**方案 A（採用）：頂層欄位作為 active vault 的鏡射。**

全專案約 23 個檔案都是讀 `getConfig().notePath` / `getConfig().sourceNoteSavePath` 兩個頂層欄位再傳給後端。本設計新增 `vaults[]` 與 `activeVaultId`，但**切換 active 時把該 vault 的路徑同步寫回頂層 `notePath` / `sourceNoteSavePath`**。因此所有既有消費端一行都不用改，向後相容、風險最低。

（已否決的方案 B：全面重構消費端改讀 `getActiveVault()`——需動 23 個檔案與測試，收益低、風險高。）

---

## Data Model

`src/app/types/note.ts` 新增：

```ts
export interface VaultEntry {
  id: string;                    // 穩定 uuid，作為 activeVaultId 的參照鍵
  name: string;                  // 友善名稱，如「工作」「個人」
  notePath: string;              // Obsidian Vault 路徑
  sourceNoteSavePath?: string;   // 該 Vault 的文獻筆記存檔路徑
}
```

`Config` 介面新增兩個欄位（既有 `notePath` / `sourceNoteSavePath` 保留，語意變為「active vault 的鏡射值」）：

```ts
vaults?: VaultEntry[];
activeVaultId?: string;
```

**不變式（Invariant）：** 當 `vaults` 存在且非空時，頂層 `notePath` / `sourceNoteSavePath` 永遠等於 `activeVaultId` 指向的 vault 的對應路徑。

---

## Migration & Sync (`src/app/utils/appConfig.ts`)

### getConfig() 遷移
- 讀取後若 `vaults` 不存在或為空陣列：用現有的 `notePath` + `sourceNoteSavePath` 合成一筆 `VaultEntry`
  - `id`：新生成的 uuid
  - `name`：從 `notePath` 取最後一段路徑（basename）；若 `notePath` 為空字串則命名為「預設」
  - `notePath` / `sourceNoteSavePath`：沿用現有值
  - 設 `activeVaultId` = 該筆 id
- 若 `activeVaultId` 指向的 id 不存在於 `vaults`（資料損毀）：fallback 到第一筆。
- 遷移後保證不變式成立（頂層鏡射 = active vault）。
- **不寫回 localStorage**（getConfig 目前只讀不寫，維持既有行為）；合成結果只存在於回傳物件，Config 頁存檔時才落地。
  - 例外：既有的 `claudeApiKey` 清除邏輯保留不動。

### 新增 Helpers
```ts
getActiveVault(config: Config): VaultEntry | undefined
setActiveVault(config: Config, id: string): Config   // 回傳新 config，頂層欄位鏡射同步
```
- `getActiveVault`：回傳 `activeVaultId` 對應的 entry；若 id 無對應但 `vaults` 非空 → 回傳第一筆；若 `vaults` 空/不存在 → 回傳 `undefined`。（注意：正常呼叫前 getConfig 已保證遷移，故 `vaults` 非空。）
- `setActiveVault`：找到 id 對應的 vault，設 `activeVaultId`，並把該 vault 的 `notePath` / `sourceNoteSavePath` 寫回頂層欄位。找不到 id 時回傳原 config 不變。

### saveConfig() 前置
- 存檔前確保頂層 `notePath` / `sourceNoteSavePath` = active vault 的路徑（防止 UI 疏漏造成不一致）。實作上由 Config 頁在組 config 物件時保證，並可在 `saveConfig` 內做一次防禦性同步。

---

## UI (`src/app/pages/Config.tsx` — 「筆記路徑」區塊)

把現在的兩個單一輸入框（Vault 路徑、文獻筆記存檔路徑）換成一份 Vault 清單：

- **每一列 Vault**顯示：
  - active 單選鈕（radio）：標記此列為目前使用的 Vault
  - 名稱輸入框
  - Vault 路徑輸入框（placeholder 沿用現有：`例如: /home/user/obsidian-vault 或 D:\obsidian\vault`）
  - 文獻筆記路徑輸入框（placeholder 沿用現有：`例如: D:\obsidian\Willy_2026\Sources\others`）
  - 刪除按鈕
- 底部：「+ 新增 Vault」按鈕（新增一列空白 entry，自動生成 id）
- 說明文字沿用現有語意（語意搜尋由 local-server 自動連接 llama-search；文獻筆記路徑留空則存 Vault 根目錄）。

### UI 狀態與邊界
- **至少保留一筆**：不可刪到零筆；只剩一筆時隱藏或停用刪除鈕。
- **刪除 active 那筆**：自動把 active 移到清單第一筆。
- **存檔（handleSave）**：組出 `vaults`、`activeVaultId`，並把 active vault 的兩個路徑寫入頂層 `notePath` / `sourceNoteSavePath` 後 `saveConfig`。
- **切換 active 後存檔**：下一次 `Api.getNotes(getConfig().notePath, ...)` 即讀到新路徑（沿用既有存檔後重新載入的流程，與今天改單一 notePath 存檔的效果相同）。

---

## Testing

擴充 `src/test/utils/appConfig.test.ts`：

1. **遷移**：舊 config（只有 `notePath` = `'D:/x/MyVault'`，無 `vaults`）→ getConfig 合成單一 vault，`name` = `'MyVault'`，`activeVaultId` 指向它，頂層鏡射一致。
2. **遷移（空路徑）**：`notePath` = `''` → 合成一筆 `name` = `'預設'`。
3. **setActiveVault**：多筆 vault 中切換 active → `activeVaultId` 更新，頂層 `notePath` / `sourceNoteSavePath` 鏡射到新 active 的值。
4. **setActiveVault（無效 id）**：回傳原 config 不變。
5. **activeVaultId 損毀**：指向不存在 id → fallback 到第一筆，不變式成立。
6. **getActiveVault**：activeVaultId 有對應 → 回傳該 entry；無對應但 vaults 非空 → 回傳第一筆；vaults 空 → 回傳 undefined。

---

## Non-Goals (YAGNI)

- 主畫面/導覽列常駐 Vault 切換器（僅設定頁）。
- 後端多 Vault 並行索引 / 跨 Vault 搜尋（一次仍只用一個 active vault，後端行為不變）。
- Vault 匯入/匯出、雲端同步 Vault 清單。
- 消費端重構為讀 `getActiveVault()`（採方案 A 鏡射，維持不變）。
