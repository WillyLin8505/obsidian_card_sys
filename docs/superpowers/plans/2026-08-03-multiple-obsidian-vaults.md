# Multiple Obsidian Vaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓使用者在設定頁維護多個 Obsidian Vault（名稱 + Vault 路徑 + 文獻筆記路徑），選一個為 active，全 App 即改用該 Vault。

**Architecture:** 採「頂層鏡射」方案：新增 `vaults[]` 與 `activeVaultId`，但切換 active 時把該 vault 的路徑同步寫回既有頂層 `notePath` / `sourceNoteSavePath`，因此約 23 個讀取這兩個欄位的消費端一律不動。遷移邏輯集中在 `appConfig.getConfig()`：舊使用者的單一 `notePath` 自動合成一筆 vault。

**Tech Stack:** React + TypeScript (Vite)、Vitest（jsdom）、localStorage 儲存 config、`crypto.randomUUID()` 產生 id。

## Global Constraints

- 語言：UI 文案用繁體中文，沿用現有字串風格。
- 不變式：`vaults` 非空時，頂層 `notePath` / `sourceNoteSavePath` 永遠等於 `activeVaultId` 指向的 vault 的對應路徑。
- 向後相容：既有讀取 `getConfig().notePath` / `getConfig().sourceNoteSavePath` 的消費端不得修改。
- `getConfig()` 對 vault 合成結果**不寫回 localStorage**（維持既有「只讀」行為；既有 `claudeApiKey` 清除邏輯不動）。
- id 產生一律用 `crypto.randomUUID()`（與 `src/app/utils/storage.ts:147` 一致）。
- 測試指令：`npx vitest run <path>`。本 repo **未安裝 TypeScript**（無 `tsc`），編譯驗證改用 `npx vite build`（esbuild，抓 import/export/JSX 語法錯誤，但不做完整型別檢查）；UI 執行期行為以手動瀏覽器驗證為準。

---

### Task 1: 資料模型、遷移與 helpers（appConfig 核心）

**Files:**
- Modify: `src/app/types/note.ts`（新增 `VaultEntry`，`Config` 加 `vaults?` / `activeVaultId?`）
- Modify: `src/app/utils/appConfig.ts`（新增 `deriveVaultName`、`ensureVaults`、`getActiveVault`、`setActiveVault`；`getConfig` 套用遷移；`saveConfig` 防禦性鏡射）
- Test: `src/test/utils/appConfig.test.ts`（擴充）

**Interfaces:**
- Produces:
  - `interface VaultEntry { id: string; name: string; notePath: string; sourceNoteSavePath?: string }`
  - `getActiveVault(config: Config): VaultEntry | undefined`
  - `setActiveVault(config: Config, id: string): Config`
  - `ensureVaults(config: Config): Config`（getConfig 內部使用；export 供測試）
- Consumes: 既有 `getConfig` / `saveConfig` / `CONFIG_KEY` / `DEFAULT_CONFIG`。

- [ ] **Step 1: 在 types 新增 VaultEntry 與 Config 欄位**

`src/app/types/note.ts`，在 `Config` interface 前新增：

```ts
export interface VaultEntry {
  id: string;
  name: string;
  notePath: string;
  sourceNoteSavePath?: string;
}
```

在 `Config` interface 內（`notePath` 附近）新增兩個欄位：

```ts
  vaults?: VaultEntry[];
  activeVaultId?: string;
```

- [ ] **Step 2: 寫失敗測試（遷移 + 切換 + fallback）**

在 `src/test/utils/appConfig.test.ts` 的 import 行加入新符號：

```ts
import { CONFIG_KEY, ensureVaults, getActiveVault, getConfig, getDataSource, getObsidianBackendUrl, localHeaders, saveConfig, setActiveVault } from '../../app/utils/appConfig';
```

在 `describe('app config', ...)` 內新增：

```ts
it('migrates a legacy single notePath into one vault (name from basename)', () => {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({
    dataSource: 'obsidian',
    notePath: 'D:/obsidian/MyVault',
    sourceNoteSavePath: 'Sources/others',
  }));

  const config = getConfig();
  expect(config.vaults).toHaveLength(1);
  expect(config.vaults?.[0].name).toBe('MyVault');
  expect(config.vaults?.[0].notePath).toBe('D:/obsidian/MyVault');
  expect(config.vaults?.[0].sourceNoteSavePath).toBe('Sources/others');
  expect(config.activeVaultId).toBe(config.vaults?.[0].id);
  // 頂層鏡射一致
  expect(config.notePath).toBe('D:/obsidian/MyVault');
  expect(config.sourceNoteSavePath).toBe('Sources/others');
});

it('names the synthesized vault 預設 when notePath is empty', () => {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ dataSource: 'obsidian', notePath: '' }));
  const config = getConfig();
  expect(config.vaults?.[0].name).toBe('預設');
});

it('setActiveVault mirrors the target vault paths to top-level fields', () => {
  const base = getConfig();
  const twoVaults = ensureVaults({
    ...base,
    vaults: [
      { id: 'a', name: 'Work', notePath: 'D:/work', sourceNoteSavePath: 'W/src' },
      { id: 'b', name: 'Personal', notePath: 'D:/personal', sourceNoteSavePath: 'P/src' },
    ],
    activeVaultId: 'a',
  });

  const switched = setActiveVault(twoVaults, 'b');
  expect(switched.activeVaultId).toBe('b');
  expect(switched.notePath).toBe('D:/personal');
  expect(switched.sourceNoteSavePath).toBe('P/src');
});

it('setActiveVault returns config unchanged for an unknown id', () => {
  const cfg = ensureVaults({
    ...getConfig(),
    vaults: [{ id: 'a', name: 'Work', notePath: 'D:/work' }],
    activeVaultId: 'a',
  });
  expect(setActiveVault(cfg, 'nope')).toEqual(cfg);
});

it('falls back to the first vault when activeVaultId is corrupt', () => {
  const cfg = ensureVaults({
    ...getConfig(),
    vaults: [
      { id: 'a', name: 'Work', notePath: 'D:/work' },
      { id: 'b', name: 'Personal', notePath: 'D:/personal' },
    ],
    activeVaultId: 'ghost',
  });
  expect(cfg.activeVaultId).toBe('a');
  expect(cfg.notePath).toBe('D:/work');
});

it('getActiveVault resolves id, then first, then undefined', () => {
  const cfg = ensureVaults({
    ...getConfig(),
    vaults: [
      { id: 'a', name: 'Work', notePath: 'D:/work' },
      { id: 'b', name: 'Personal', notePath: 'D:/personal' },
    ],
    activeVaultId: 'b',
  });
  expect(getActiveVault(cfg)?.id).toBe('b');
  expect(getActiveVault({ ...cfg, activeVaultId: 'ghost' })?.id).toBe('a');
  expect(getActiveVault({ ...cfg, vaults: [] })).toBeUndefined();
});
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npx vitest run src/test/utils/appConfig.test.ts`
Expected: FAIL —「ensureVaults / setActiveVault / getActiveVault is not a function」等匯出不存在錯誤。

- [ ] **Step 4: 在 appConfig 實作 helpers 與遷移**

`src/app/utils/appConfig.ts`，在檔案頂部 import 補上型別：

```ts
import { CardFontSizes, Config, DataSource, MetadataField, NoteTemplateConfig, VaultEntry } from '../types/note';
```

在 `migrateTemplate` 之後、`getConfig` 之前新增：

```ts
function deriveVaultName(notePath: string): string {
  if (!notePath) return '預設';
  const trimmed = notePath.replace(/[\\/]+$/, '');
  const parts = trimmed.split(/[\\/]/);
  const base = parts[parts.length - 1];
  return base || '預設';
}

export function ensureVaults(config: Config): Config {
  let vaults: VaultEntry[] = Array.isArray(config.vaults) ? config.vaults : [];
  if (vaults.length === 0) {
    vaults = [{
      id: crypto.randomUUID(),
      name: deriveVaultName(config.notePath),
      notePath: config.notePath || '',
      sourceNoteSavePath: config.sourceNoteSavePath,
    }];
  }
  let active = vaults.find((v) => v.id === config.activeVaultId);
  if (!active) active = vaults[0];
  return {
    ...config,
    vaults,
    activeVaultId: active.id,
    notePath: active.notePath || '',
    sourceNoteSavePath: active.sourceNoteSavePath,
  };
}

export function getActiveVault(config: Config): VaultEntry | undefined {
  const vaults = config.vaults || [];
  if (vaults.length === 0) return undefined;
  return vaults.find((v) => v.id === config.activeVaultId) || vaults[0];
}

export function setActiveVault(config: Config, id: string): Config {
  const target = (config.vaults || []).find((v) => v.id === id);
  if (!target) return config;
  return {
    ...config,
    activeVaultId: id,
    notePath: target.notePath || '',
    sourceNoteSavePath: target.sourceNoteSavePath,
  };
}
```

在 `getConfig` 的 `return { ...DEFAULT_CONFIG, ...saved, ... }` 改為先組物件再套用遷移。將現有：

```ts
  return {
    ...DEFAULT_CONFIG,
    ...(saved as Partial<Config>),
    cardFontSizes: { ...DEFAULT_CARD_FONT_SIZES, ...((saved.cardFontSizes as Partial<CardFontSizes>) || {}) },
    fleetNoteTemplate: migrateTemplate(saved.fleetNoteTemplate ?? DEFAULT_CONFIG.fleetNoteTemplate),
    permanentNoteTemplate: migrateTemplate(saved.permanentNoteTemplate ?? DEFAULT_CONFIG.permanentNoteTemplate),
    sourceNoteTemplate: migrateTemplate(saved.sourceNoteTemplate ?? DEFAULT_CONFIG.sourceNoteTemplate),
  };
```

改為：

```ts
  const merged: Config = {
    ...DEFAULT_CONFIG,
    ...(saved as Partial<Config>),
    cardFontSizes: { ...DEFAULT_CARD_FONT_SIZES, ...((saved.cardFontSizes as Partial<CardFontSizes>) || {}) },
    fleetNoteTemplate: migrateTemplate(saved.fleetNoteTemplate ?? DEFAULT_CONFIG.fleetNoteTemplate),
    permanentNoteTemplate: migrateTemplate(saved.permanentNoteTemplate ?? DEFAULT_CONFIG.permanentNoteTemplate),
    sourceNoteTemplate: migrateTemplate(saved.sourceNoteTemplate ?? DEFAULT_CONFIG.sourceNoteTemplate),
  };
  return ensureVaults(merged);
```

同時把 `getConfig` 開頭 `if (!raw) return { ...DEFAULT_CONFIG };` 改為 `if (!raw) return ensureVaults({ ...DEFAULT_CONFIG });`，確保無 config 時也有一筆 vault。

最後在 `saveConfig` 加防禦性鏡射，將：

```ts
export function saveConfig(config: Config): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}
```

改為：

```ts
export function saveConfig(config: Config): void {
  const active = getActiveVault(config);
  const synced: Config = active
    ? { ...config, activeVaultId: active.id, notePath: active.notePath || '', sourceNoteSavePath: active.sourceNoteSavePath }
    : config;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(synced));
}
```

- [ ] **Step 5: 執行測試確認通過（含既有測試無回歸）**

Run: `npx vitest run src/test/utils/appConfig.test.ts`
Expected: PASS（新增 6 個 + 既有 5 個測試全綠）。

- [ ] **Step 6: 型別檢查**

Run: `npx tsc --noEmit`
Expected: 無錯誤（新符號與型別皆解析成功）。

- [ ] **Step 7: Commit**

```bash
git add src/app/types/note.ts src/app/utils/appConfig.ts src/test/utils/appConfig.test.ts
git commit -m "feat(config): multi-vault data model, migration, and active-vault helpers"
```

---

### Task 2: 設定頁 Vault 清單 UI

**Files:**
- Modify: `src/app/pages/Config.tsx`（state、handlers、handleSave、「筆記路徑」區塊 JSX）

**Interfaces:**
- Consumes（來自 Task 1）：`VaultEntry`（`src/app/types/note.ts`）、config 上的 `vaults` / `activeVaultId`。
- Produces: 無新 API；僅組出含 `vaults` / `activeVaultId` 且頂層鏡射正確的 `Config` 交給 `storage.saveConfig`。

- [ ] **Step 1: 更新 import 與 state**

`src/app/pages/Config.tsx` 第 4 行，將型別 import 補上 `VaultEntry`：

```ts
import { Config as ConfigType, DataSource, NoteTemplateConfig, MetadataField, CardFontSizes, VaultEntry } from '../types/note';
```

刪除第 18–19 行的 `notePath` / `sourceNoteSavePath` state，改為：

```ts
  const [vaults, setVaults] = useState<VaultEntry[]>(config.vaults || []);
  const [activeVaultId, setActiveVaultId] = useState<string>(config.activeVaultId || '');
```

- [ ] **Step 2: 更新 config 同步的 useEffect**

在第 42–51 行的 `useEffect(() => { ... }, [config])` 中，把：

```ts
    setNotePath(config.notePath);
    setSourceNoteSavePath(config.sourceNoteSavePath || '');
```

替換為：

```ts
    setVaults(config.vaults || []);
    setActiveVaultId(config.activeVaultId || '');
```

- [ ] **Step 3: 新增 vault 操作 handlers**

在 `handleSave` 之前新增：

```ts
  const updateVault = (id: string, patch: Partial<VaultEntry>) => {
    setVaults((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const addVault = () => {
    const nv: VaultEntry = { id: crypto.randomUUID(), name: '', notePath: '', sourceNoteSavePath: '' };
    setVaults((vs) => [...vs, nv]);
    if (!activeVaultId) setActiveVaultId(nv.id);
  };

  const removeVault = (id: string) => {
    setVaults((vs) => {
      if (vs.length <= 1) return vs; // 至少保留一筆
      const next = vs.filter((v) => v.id !== id);
      if (id === activeVaultId) setActiveVaultId(next[0].id);
      return next;
    });
  };
```

- [ ] **Step 4: 更新 handleSave**

將第 100–116 行的 `newConfig` 組法，移除 `notePath` / `sourceNoteSavePath` 兩行，改為在最前面加入 vaults 與鏡射欄位。新的 `newConfig` 開頭改為：

```ts
    const activeVault = vaults.find((v) => v.id === activeVaultId) || vaults[0];
    const newConfig: ConfigType = {
      vaults,
      activeVaultId: activeVault?.id,
      notePath: activeVault?.notePath || '',
      sourceNoteSavePath: activeVault?.sourceNoteSavePath?.trim() || undefined,
      fleetNoteTemplate,
      permanentNoteTemplate,
      sourceNoteTemplate,
      dataSource,
      obsidianBackendUrl: obsidianBackendUrl.trim() || 'http://localhost:3001',
      localServerToken: localServerToken.trim() || undefined,
      allowExternalAnalysis,
      fleetNoteTags,
      sourceNoteTags,
      displayMetadataKeys,
      fontSize: 12,
      cardFontSizes,
    };
```

- [ ] **Step 5: 置換「筆記路徑」區塊 JSX**

把第 287–327 行整個 `{/* Path Configuration */}` 區塊（`<div className="bg-white border rounded-lg p-6">` … 對應收尾 `</div>`）替換為：

```tsx
        {/* Path Configuration */}
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen className="size-5 text-gray-600" />
            <h2>筆記路徑（Vault 清單）</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            管理多個 {dataSource === 'obsidian' ? 'Obsidian Vault' : '筆記'} 路徑，選一個為使用中。一次只用一個。
          </p>

          <div className="space-y-4">
            {vaults.map((v) => (
              <div
                key={v.id}
                className={`border rounded-lg p-4 space-y-3 ${v.id === activeVaultId ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
              >
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="radio"
                      name="active-vault"
                      checked={v.id === activeVaultId}
                      onChange={() => setActiveVaultId(v.id)}
                    />
                    使用中
                  </label>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-gray-400"
                    onClick={() => removeVault(v.id)}
                    disabled={vaults.length <= 1}
                    aria-label="刪除此 Vault"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div>
                  <label className="block text-sm mb-1">名稱</label>
                  <Input
                    value={v.name}
                    onChange={(e) => updateVault(v.id, { name: e.target.value })}
                    placeholder="例如: 工作 / 個人 / 專案"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1">
                    {dataSource === 'obsidian' ? 'Obsidian Vault 路徑' : '筆記儲存路徑'}
                  </label>
                  <Input
                    value={v.notePath}
                    onChange={(e) => updateVault(v.id, { notePath: e.target.value })}
                    placeholder={dataSource === 'obsidian' ? '例如: /home/user/obsidian-vault 或 D:\\obsidian\\vault' : '例如: ~/Documents/Notes'}
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1 flex items-center gap-1">
                    <BookOpen className="size-4 text-green-600" />
                    文獻筆記存檔路徑
                  </label>
                  <Input
                    value={v.sourceNoteSavePath || ''}
                    onChange={(e) => updateVault(v.id, { sourceNoteSavePath: e.target.value })}
                    placeholder="例如: D:\obsidian\Willy_2026\Sources\others"
                  />
                </div>
              </div>
            ))}

            <Button variant="outline" onClick={addVault}>
              <Plus className="size-4 mr-1" /> 新增 Vault
            </Button>

            <p className="text-sm text-gray-500">
              {dataSource === 'obsidian'
                ? '使用中的 Vault 路徑會套用到全 App。語意搜尋由 local-server 自動連接 llama-search。文獻筆記路徑留空則存到 Vault 根目錄。'
                : '設定您的 Markdown 檔案儲存位置。'}
            </p>
          </div>
        </div>
```

（`FolderOpen`、`BookOpen`、`Plus`、`X`、`Button`、`Input` 皆已在既有 import 中，無需新增。）

- [ ] **Step 6: 編譯驗證（vite build）**

Run: `npx vite build`
Expected: build 成功。若有殘留 import 錯誤（例如 `VaultEntry` 未從 types 匯出）或 JSX 語法錯誤會在此失敗。
注意：本 repo 無 TypeScript，esbuild 不做完整型別檢查，也不會把「殘留的 `notePath` 未宣告識別字」當成 build 失敗（會被當全域參照）；該類問題須靠 Step 5 的仔細實作與 Step 8 手動驗證攔截——實作時務必確認已移除所有 `notePath` / `sourceNoteSavePath` 舊 state 的參照。

- [ ] **Step 7: 全測試無回歸**

Run: `npx vitest run`
Expected: 既有測試綠燈（含 ctrl-click 等使用 notePath 的測試）。註：`src/test/utils/appConfig.test.ts` 內有 2 個因本機 `.env.local` 造成的既存失敗（`returns defaults when config is missing`、`uses same-origin api ... backend URL is invalid`），與本變更無關，維持不變即可。

- [ ] **Step 8: 手動驗證（瀏覽器）**

啟動前端：`npm run dev`，開設定頁：
- 初次載入：舊有單一路徑已自動變成一筆 Vault，且為「使用中」。
- 「新增 Vault」→ 填名稱與路徑 → 用 radio 切成使用中 → 儲存 → 重新整理後仍記住；回到筆記頁確認讀到新 Vault 的筆記。
- 刪除非使用中 Vault 正常；只剩一筆時刪除鈕停用；刪除使用中那筆時 active 自動移到第一筆。

- [ ] **Step 9: Commit**

```bash
git add src/app/pages/Config.tsx
git commit -m "feat(config): vault list UI with active selection in settings page"
```

---

## Self-Review

**Spec coverage:**
- 資料模型 `VaultEntry` + `vaults`/`activeVaultId` → Task 1 Step 1。✓
- 遷移（basename / 空路徑→預設 / 損毀 fallback）→ Task 1 Steps 2、4 + 測試。✓
- `getActiveVault` / `setActiveVault` 鏡射 → Task 1 Step 4 + 測試。✓
- saveConfig 前置鏡射 → Task 1 Step 4。✓
- 設定頁 Vault 清單 UI（radio active / 名稱 / 兩路徑 / 刪除 / 新增 / 至少一筆 / 刪 active 自動移轉）→ Task 2 Steps 3–5。✓
- 頂層鏡射不動 23 消費端 → 未修改任何消費端檔案，僅新增欄位。✓
- 測試 6 項 → Task 1 Step 2 全覆蓋。✓
- Non-Goals（主畫面切換器、後端多 vault、消費端重構）→ 未納入。✓

**Placeholder scan:** 無 TBD/TODO；每個 code step 均有完整程式碼與確切指令/預期輸出。

**Type consistency:** `VaultEntry` 欄位（id/name/notePath/sourceNoteSavePath）在 Task 1、2 一致；`ensureVaults`/`getActiveVault`/`setActiveVault` 簽章在測試與實作一致；Config 頁 handler（`updateVault`/`addVault`/`removeVault`）名稱前後一致。
