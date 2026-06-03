#!/usr/bin/env node

import { access, readFile } from 'fs/promises';
import { join } from 'path';

function argValue(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find(arg => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : '';
}

async function readEnvFile(path) {
  try {
    return Object.fromEntries(
      (await readFile(path, 'utf8'))
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

const envFile = await readEnvFile('local-server/.env');
const BASE_URL = (argValue('base') || process.env.TEST_LOCAL_SERVER_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const VAULT_PATH = process.env.TEST_VAULT_PATH || '/mnt/d/obsidian/Willy_2026';
const TARGET_DIRECTORY = process.env.TEST_SOURCE_NOTE_DIRECTORY || join(VAULT_PATH, 'Sources', 'others');
const filename = `_codex-source-note-path-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.md`;
const expectedRelativePath = `Sources/others/${filename}`;
const expectedFilePath = join(TARGET_DIRECTORY, filename);
const gatewayToken = process.env.TEST_GATEWAY_TOKEN || envFile.APP_GATEWAY_TOKEN || '';
const useGatewayAuth = argValue('gateway') === '1' || BASE_URL.includes(':3020') || /^https:\/\/[^/]+\/api$/i.test(BASE_URL);

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (useGatewayAuth && gatewayToken) {
    headers.Cookie = `card_box_gateway=${encodeURIComponent(gatewayToken)}`;
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${body.error || response.statusText}`);
  return body;
}

async function cleanup(relativePath) {
  if (!relativePath) return;
  await request('/notes', {
    method: 'DELETE',
    body: JSON.stringify({ vaultPath: VAULT_PATH, relativePath }),
  });
  console.log(`[cleanup] deleted ${relativePath}`);
}

async function main() {
  let relativePath = '';
  try {
    console.log(`[create] ${expectedFilePath}`);
    const created = await request('/notes', {
      method: 'POST',
      body: JSON.stringify({
        vaultPath: VAULT_PATH,
        targetDirectory: TARGET_DIRECTORY,
        filename,
        content: '# Source note path test\n',
      }),
    });
    relativePath = created.relativePath;
    if (relativePath !== expectedRelativePath) {
      throw new Error(`unexpected relativePath: ${relativePath}`);
    }

    await access(expectedFilePath);
    const content = await readFile(expectedFilePath, 'utf8');
    if (!content.includes('Source note path test')) throw new Error('created file content mismatch');

    console.log(`[verify] exists ${relativePath}`);
    console.log('[result] PASS');
  } finally {
    await cleanup(relativePath);
  }
}

main().catch(err => {
  console.error(`[result] FAIL: ${err.message}`);
  process.exit(1);
});
