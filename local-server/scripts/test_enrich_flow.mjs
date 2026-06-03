#!/usr/bin/env node

import { readFileSync } from 'fs';

function argValue(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find(arg => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : '';
}

function readEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#') && line.includes('='))
        .map(line => {
          const index = line.indexOf('=');
          return [line.slice(0, index), line.slice(index + 1)];
        })
    );
  } catch {
    return {};
  }
}

const envFile = readEnvFile('local-server/.env');
const BASE_URL = (argValue('base') || process.env.TEST_LOCAL_SERVER_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const VAULT_PATH = process.env.TEST_VAULT_PATH || '/mnt/d/obsidian/Willy_2026';
const filename = `_codex-ai-enrich-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.md`;
const gatewayToken = process.env.TEST_GATEWAY_TOKEN || envFile.APP_GATEWAY_TOKEN || '';
const localServerToken = process.env.TEST_LOCAL_SERVER_TOKEN || envFile.LOCAL_SERVER_TOKEN || '';
const useGatewayAuth = argValue('gateway') === '1' || BASE_URL.includes(':3020') || /^https:\/\/[^/]+\/api$/i.test(BASE_URL);

const created = [];

function log(step, message) {
  console.log(`[${step}] ${message}`);
}

async function jsonRequest(step, path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (useGatewayAuth && gatewayToken) {
    headers.Cookie = `card_box_gateway=${encodeURIComponent(gatewayToken)}`;
  } else if (localServerToken) {
    headers['x-local-server-token'] = localServerToken;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    throw new Error(`${step} failed (${response.status}): ${body?.error || body?.raw || response.statusText}`);
  }
  return body;
}

async function cleanup() {
  for (const relativePath of created.reverse()) {
    try {
      await jsonRequest('cleanup', '/notes', {
        method: 'DELETE',
        body: JSON.stringify({ vaultPath: VAULT_PATH, relativePath }),
      });
      log('cleanup', `deleted ${relativePath}`);
    } catch (err) {
      console.error(`[cleanup] failed for ${relativePath}: ${err.message}`);
    }
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function frontmatterField(content, key) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return '';
  const yaml = match[1];
  const line = yaml.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  if (line && line[1].trim()) return line[1].trim();
  const block = yaml.match(new RegExp(`^${key}:\\s*\\n((?:[ \\t]+-[^\\n]*\\n?)+)`, 'm'));
  return block ? block[1].trim() : '';
}

async function main() {
  try {
    log('health', `checking ${BASE_URL}`);
    const health = await jsonRequest('health', '/health');
    log('health', `search=${health.search?.ok} claude=${health.claude?.ok}`);

    const content = [
      '---',
      'create date: 2026-05-30',
      'aliases:',
      'tags:',
      '  - 3card/筆記法/卡片盒筆記法/靈感筆記',
      'abstract:',
      'connect:',
      '---',
      '# Note',
      '這是一篇自動化測試筆記，用來驗證 AI 填充連結是否能用 Claude CLI 產生摘要與連結關鍵字。',
      '',
      '# Question',
      '如何確認 AI 填充流程真的能從前端所需的 API 完整跑完？',
      '',
      '# personal connection or purpose',
      '這篇筆記應該被填入 abstract 和 connect，並可用於後續相關筆記搜尋。',
      '',
      '# TO DO step',
      '驗證建立、讀取、填充、重新載入與搜尋流程。',
    ].join('\n');

    log('create', filename);
    const createdNote = await jsonRequest('create', '/notes', {
      method: 'POST',
      body: JSON.stringify({ vaultPath: VAULT_PATH, filename, content }),
    });
    const relativePath = createdNote.relativePath || filename;
    created.push(relativePath);

    log('read', relativePath);
    const before = await jsonRequest('read', `/notes/file?vault=${encodeURIComponent(VAULT_PATH)}&file=${encodeURIComponent(relativePath)}`, {
      method: 'GET',
      headers: {},
    });
    assert(before.id === relativePath, `unexpected note id: ${before.id}`);

    log('enrich', relativePath);
    await jsonRequest('enrich', '/enrich-note', {
      method: 'POST',
      body: JSON.stringify({ relativePath, vaultPath: VAULT_PATH }),
    });

    log('reload', 'refreshing note cache');
    const notes = await jsonRequest('reload', `/notes/reload?path=${encodeURIComponent(VAULT_PATH)}&summary=1`, {
      method: 'POST',
      headers: {},
    });
    assert(Array.isArray(notes), 'reload did not return notes array');
    assert(notes.some(note => note.id === relativePath), 'reloaded summary does not contain test note');

    log('verify', relativePath);
    const after = await jsonRequest('verify', `/notes/file?vault=${encodeURIComponent(VAULT_PATH)}&file=${encodeURIComponent(relativePath)}`, {
      method: 'GET',
      headers: {},
    });
    const abstract = frontmatterField(after.content, 'abstract');
    const connect = frontmatterField(after.content, 'connect');
    assert(abstract.length >= 10, `abstract was not filled: ${JSON.stringify(abstract)}`);
    assert(connect.length >= 5, `connect was not filled: ${JSON.stringify(connect)}`);
    log('verify', `abstract=${abstract.slice(0, 60)} connect=${connect.replace(/\n/g, ' | ')}`);

    log('search', 'checking related-note search path');
    const search = await jsonRequest('search', '/search', {
      method: 'POST',
      body: JSON.stringify({ question: `${after.title} ${abstract} ${connect}`, top_k: 5 }),
    });
    assert(Array.isArray(search.chunks), 'search did not return chunks array');
    log('search', `chunks=${search.chunks.length}`);

    log('result', 'PASS');
  } finally {
    await cleanup();
  }
}

main().catch(async (err) => {
  console.error(`[result] FAIL: ${err.message}`);
  await cleanup();
  process.exit(1);
});
