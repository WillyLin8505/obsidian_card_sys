// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG_KEY, getConfig, getDataSource, getObsidianBackendUrl, localHeaders, saveConfig } from '../../app/utils/appConfig';

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
});
