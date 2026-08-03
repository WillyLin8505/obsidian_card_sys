// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG_KEY, ensureVaults, getActiveVault, getConfig, getDataSource, getObsidianBackendUrl, localHeaders, saveConfig, setActiveVault } from '../../app/utils/appConfig';

describe('app config', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('returns defaults when config is missing', () => {
    expect(getDataSource()).toBe('supabase');
    expect(getObsidianBackendUrl()).toBe('http://localhost:3001');
  });

  it('migrates legacy template strings and removes legacy api key', () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({
      claudeApiKey: 'legacy-secret',
      dataSource: 'obsidian',
      permanentNoteTemplate: '---\ntags:\n  - a\n  - b\n---\nBody',
    }));

    const config = getConfig();
    expect(config.dataSource).toBe('obsidian');
    expect(config.permanentNoteTemplate.metadataFields).toContainEqual({ key: 'tags', defaultValue: 'a,b' });
    expect(JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}')).not.toHaveProperty('claudeApiKey');
  });

  it('normalizes local server URL and injects auth header', () => {
    const config = getConfig();
    saveConfig({ ...config, obsidianBackendUrl: 'http://localhost:3001/', localServerToken: 'token-1' });

    expect(getObsidianBackendUrl()).toBe('http://localhost:3001');
    expect(localHeaders({ 'Content-Type': 'application/json' })).toMatchObject({
      'Content-Type': 'application/json',
      'x-local-server-token': 'token-1',
    });
  });

  it('uses same-origin api on remote gateway pages even when local backend URL is saved', () => {
    vi.stubGlobal('window', {
      location: {
        hostname: 'desktop-6o0unv6-2.taileefcfe.ts.net',
        origin: 'https://desktop-6o0unv6-2.taileefcfe.ts.net',
      },
    });

    const config = getConfig();
    saveConfig({ ...config, obsidianBackendUrl: 'http://127.0.0.1:3001' });

    expect(getObsidianBackendUrl()).toBe('https://desktop-6o0unv6-2.taileefcfe.ts.net/api');
  });

  it('uses same-origin api on remote gateway pages when backend URL is invalid', () => {
    vi.stubGlobal('window', {
      location: {
        hostname: 'desktop-6o0unv6-2.taileefcfe.ts.net',
        origin: 'https://desktop-6o0unv6-2.taileefcfe.ts.net',
      },
    });

    const config = getConfig();
    saveConfig({ ...config, obsidianBackendUrl: 'localhost:3001' });

    expect(getObsidianBackendUrl()).toBe('https://desktop-6o0unv6-2.taileefcfe.ts.net/api');
  });

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

  it('getConfig returns a stable activeVaultId and vault id across repeated calls with no saved config', () => {
    const first = getConfig();
    const second = getConfig();
    expect(second.activeVaultId).toBe(first.activeVaultId);
    expect(second.vaults?.[0].id).toBe(first.vaults?.[0].id);
  });

  it('getConfig migrates a legacy config without vaults with a stable id and writes back once', () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ dataSource: 'obsidian', notePath: 'D:/x/Legacy' }));

    const first = getConfig();
    const second = getConfig();
    expect(second.activeVaultId).toBe(first.activeVaultId);

    const persisted = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    expect(Array.isArray(persisted.vaults)).toBe(true);
  });

  it('saveConfig preserves persisted vaults when the vaults key is omitted', () => {
    const seeded = ensureVaults({
      ...getConfig(),
      vaults: [
        { id: 'a', name: 'Work', notePath: 'D:/work' },
        { id: 'b', name: 'Personal', notePath: 'D:/personal' },
      ],
      activeVaultId: 'a',
    });
    saveConfig(seeded);

    // Mimic Config.tsx handleSave: a fresh object literal without vaults/activeVaultId.
    const { vaults: _vaults, activeVaultId: _activeVaultId, ...rest } = seeded;
    saveConfig({ ...rest } as typeof seeded);

    const config = getConfig();
    expect(config.vaults).toHaveLength(2);
  });

  it('saveConfig persists an explicit smaller vaults array (deletion works)', () => {
    const seeded = ensureVaults({
      ...getConfig(),
      vaults: [
        { id: 'a', name: 'Work', notePath: 'D:/work' },
        { id: 'b', name: 'Personal', notePath: 'D:/personal' },
      ],
      activeVaultId: 'a',
    });
    saveConfig(seeded);

    saveConfig({ ...seeded, vaults: [{ id: 'a', name: 'Work', notePath: 'D:/work' }] });

    const config = getConfig();
    expect(config.vaults).toHaveLength(1);
  });
});
