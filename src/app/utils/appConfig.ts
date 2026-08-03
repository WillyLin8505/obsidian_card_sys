import { CardFontSizes, Config, DataSource, MetadataField, NoteTemplateConfig, VaultEntry } from '../types/note';

export const CONFIG_KEY = 'zettelkasten_config';

export const DEFAULT_CARD_FONT_SIZES: CardFontSizes = {
  title: 18,
  h1: 16,
  h2: 14,
  h3: 13,
  h4: 12,
  body: 12,
  metadata: 11,
};

// Machine-specific defaults come from an untracked .env.local (VITE_* vars),
// NOT from committed code — otherwise each machine (Mac vs WSL) would fight
// over these lines on every sync. Neutral fallbacks keep the repo conflict-free.
const ENV = (import.meta as { env?: Record<string, string | undefined> }).env || {};
export const DEFAULT_CONFIG: Config = {
  notePath: ENV.VITE_DEFAULT_VAULT_PATH || '',
  sourceNoteSavePath: ENV.VITE_DEFAULT_SOURCE_NOTE_PATH || '',
  dataSource: (ENV.VITE_DEFAULT_DATA_SOURCE as Config['dataSource']) || 'obsidian',
  obsidianBackendUrl: 'http://localhost:3001',
  allowExternalAnalysis: false,
  fleetNoteTemplate: {
    metadataFields: [
      { key: 'create date', defaultValue: '' },
      { key: 'aliases', defaultValue: '' },
      { key: 'tags', defaultValue: '3card/筆記法/卡片盒筆記法/靈感筆記' },
    ],
    bodyTemplate: '# Note\n\n# Question \n\n# personal connection or purpose\n\n# TO DO step \n\n# others &  Reference',
  },
  permanentNoteTemplate: {
    metadataFields: [
      { key: 'create date', defaultValue: '' },
      { key: 'aliases', defaultValue: '' },
      { key: 'tags', defaultValue: '3card/筆記法/卡片盒筆記法/永久筆記' },
    ],
    bodyTemplate: '# Note\n\n# Question \n\n# personal connection or purpose\n\n# TO DO step \n\n# others &  Reference',
  },
  sourceNoteTemplate: {
    metadataFields: [
      { key: 'create date', defaultValue: '' },
      { key: 'aliases', defaultValue: '' },
      { key: 'tags', defaultValue: '3card/筆記法/卡片盒筆記法/文獻筆記' },
    ],
    bodyTemplate: '# 文獻筆記\n\n## 來源資訊\n- 作者：\n- 標題：\n- 連結：\n\n## 重點摘要\n\n## 文章內容\n\n',
  },
  fleetNoteTags: [],
  sourceNoteTags: [],
  displayMetadataKeys: [],
  fontSize: 12,
  cardFontSizes: DEFAULT_CARD_FONT_SIZES,
};

export function migrateTemplate(value: unknown): NoteTemplateConfig {
  if (typeof value === 'object' && value !== null && 'metadataFields' in value) {
    return value as NoteTemplateConfig;
  }
  if (typeof value !== 'string') {
    return { metadataFields: [], bodyTemplate: '' };
  }

  const fmMatch = value.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { metadataFields: [], bodyTemplate: value };
  }
  const fmLines = fmMatch[1].split('\n');
  const body = fmMatch[2].replace(/^\n/, '');
  const fields: MetadataField[] = [];
  let i = 0;
  while (i < fmLines.length) {
    const line = fmLines[i];
    const kv = line.match(/^([^:]+):\s*(.*)$/);
    if (!kv) { i += 1; continue; }
    const key = kv[1].trim();
    let val = kv[2].trim();
    const listItems: string[] = [];
    while (i + 1 < fmLines.length && fmLines[i + 1].startsWith('  - ')) {
      listItems.push(fmLines[i + 1].replace(/^\s+-\s*/, '').trim());
      i += 1;
    }
    if (listItems.length > 0) val = listItems.join(',');
    fields.push({ key, defaultValue: val });
    i += 1;
  }
  return { metadataFields: fields, bodyTemplate: body };
}

function deriveVaultName(notePath: string): string {
  if (!notePath) return '預設';
  const trimmed = notePath.replace(/[\\/]+$/, '');
  const parts = trimmed.split(/[\\/]/);
  const base = parts[parts.length - 1];
  return base || '預設';
}

// INVARIANT: top-level `notePath`/`sourceNoteSavePath` are DERIVED MIRRORS of the
// active vault — the ~23 existing consumers read them directly. To change paths,
// mutate `vaults` + `activeVaultId` and let saveConfig re-mirror; writing `notePath`
// straight through saveConfig is silently overwritten by this mirror.
function mirrorVault(config: Config, vault: VaultEntry): Config {
  return {
    ...config,
    activeVaultId: vault.id,
    notePath: vault.notePath || '',
    sourceNoteSavePath: vault.sourceNoteSavePath,
  };
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
  return mirrorVault({ ...config, vaults }, active);
}

export function getActiveVault(config: Config): VaultEntry | undefined {
  const vaults = config.vaults || [];
  if (vaults.length === 0) return undefined;
  return vaults.find((v) => v.id === config.activeVaultId) || vaults[0];
}

export function setActiveVault(config: Config, id: string): Config {
  const target = (config.vaults || []).find((v) => v.id === id);
  if (!target) return config;
  return mirrorVault(config, target);
}

export function getConfig(): Config {
  const raw = localStorage.getItem(CONFIG_KEY);
  if (!raw) {
    const result = ensureVaults({ ...DEFAULT_CONFIG });
    localStorage.setItem(CONFIG_KEY, JSON.stringify(result));
    return result;
  }
  const saved = JSON.parse(raw) as Record<string, unknown>;
  let needsWriteBack = false;
  if ('claudeApiKey' in saved) {
    delete saved.claudeApiKey;
    needsWriteBack = true;
  }
  const hadVaults = Array.isArray(saved.vaults) && saved.vaults.length > 0;
  const merged: Config = {
    ...DEFAULT_CONFIG,
    ...(saved as Partial<Config>),
    cardFontSizes: { ...DEFAULT_CARD_FONT_SIZES, ...((saved.cardFontSizes as Partial<CardFontSizes>) || {}) },
    fleetNoteTemplate: migrateTemplate(saved.fleetNoteTemplate ?? DEFAULT_CONFIG.fleetNoteTemplate),
    permanentNoteTemplate: migrateTemplate(saved.permanentNoteTemplate ?? DEFAULT_CONFIG.permanentNoteTemplate),
    sourceNoteTemplate: migrateTemplate(saved.sourceNoteTemplate ?? DEFAULT_CONFIG.sourceNoteTemplate),
  };
  const result = ensureVaults(merged);
  if (!hadVaults) needsWriteBack = true;
  if (needsWriteBack) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(result));
  }
  return result;
}

export function saveConfig(config: Config): void {
  let base: Config = config;
  if (config.vaults === undefined) {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) {
        const existing = JSON.parse(raw) as Partial<Config>;
        if (existing.vaults !== undefined) {
          base = { ...config, vaults: existing.vaults };
          if (config.activeVaultId === undefined && existing.activeVaultId !== undefined) {
            base = { ...base, activeVaultId: existing.activeVaultId };
          }
        }
      }
    } catch {
      // ignore parse errors, fall through to writing as given
    }
  }
  const active = getActiveVault(base);
  const synced: Config = active ? mirrorVault(base, active) : base;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(synced));
}

export function getDataSource(): DataSource {
  try {
    return getConfig().dataSource || 'supabase';
  } catch {
    return 'supabase';
  }
}

export function getObsidianBackendUrl(): string {
  try {
    const configuredUrl = getConfig().obsidianBackendUrl;
    const isBrowser = typeof window !== 'undefined';
    const host = isBrowser ? window.location.hostname : '';
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '';
    const remoteApiUrl = isBrowser && !isLocalHost ? `${window.location.origin}/api` : '';
    let configuredHost = '';
    if (configuredUrl) {
      try {
        configuredHost = new URL(configuredUrl).hostname;
      } catch {
        if (remoteApiUrl) return remoteApiUrl;
      }
    }
    const configuredIsLocal = configuredHost === 'localhost' || configuredHost === '127.0.0.1' || configuredHost === '0.0.0.0';
    if (remoteApiUrl && (!configuredUrl || configuredIsLocal)) {
      return remoteApiUrl;
    }
    if (configuredUrl && (configuredUrl !== DEFAULT_CONFIG.obsidianBackendUrl || isLocalHost)) {
      return configuredUrl.replace(/\/$/, '');
    }
    if (remoteApiUrl) return remoteApiUrl;
    return (DEFAULT_CONFIG.obsidianBackendUrl || 'http://localhost:3001').replace(/\/$/, '');
  } catch {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return `${window.location.origin}/api`;
      }
    }
    return 'http://localhost:3001';
  }
}

export function getLocalServerToken(): string {
  try {
    return getConfig().localServerToken || '';
  } catch {
    return '';
  }
}

export function allowsExternalAnalysis(): boolean {
  try {
    return getConfig().allowExternalAnalysis === true;
  } catch {
    return false;
  }
}

export function requireExternalAnalysis(): void {
  if (!allowsExternalAnalysis()) {
    throw new Error('請先到設定頁啟用「允許外部網址/AI 分析」。');
  }
}

export function localHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {};
  if (extra) {
    if (extra instanceof Headers) {
      extra.forEach((value, key) => { headers[key] = value; });
    } else if (Array.isArray(extra)) {
      extra.forEach(([key, value]) => { headers[key] = value; });
    } else {
      Object.assign(headers, extra);
    }
  }
  const token = getLocalServerToken();
  if (token) headers['x-local-server-token'] = token;
  return headers;
}
