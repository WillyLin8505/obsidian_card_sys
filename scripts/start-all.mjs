#!/usr/bin/env node
// Cross-platform launcher for the Card Box local stack.
//
// Replaces the old shell one-liner in package.json, which was broken on Windows:
//   - it invoked ./bin/cloudflared, a Linux ELF that can't run on Windows/macOS
//   - it pointed --config at ~/.cloudflared/cardbox-config.yml, which doesn't exist
//   - it relied on $HOME expansion, which cmd.exe (npm's default shell) doesn't do
//
// This launcher spawns each process with `node` / the resolved cloudflared binary
// directly (no shell, no npm indirection), so it behaves identically on Windows,
// macOS, and Linux.
//
// Usage:
//   node scripts/start-all.mjs                 # run everything
//   node scripts/start-all.mjs server tunnel   # run only the backend + tunnel
//   node scripts/start-all.mjs backend tunnel  # 'backend' is an alias for 'server'
//   node scripts/start-all.mjs --check         # print the resolved plan and exit
//
// Env:
//   PORT              backend port (default 3004; MUST match ~/.cloudflared/config.yml)
//   CLOUDFLARED_BIN   override the cloudflared binary path
//   CLOUDFLARED_CONFIG override the tunnel config path

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL_SERVER = join(ROOT, 'local-server');
const PORT = process.env.PORT || '3004';

const COLORS = {
  reset: '\x1b[0m',
  frontend: '\x1b[34m', // blue
  server: '\x1b[32m',   // green
  'ios-gw': '\x1b[35m', // magenta
  'app-gw': '\x1b[33m', // yellow
  tunnel: '\x1b[36m',   // cyan
  meta: '\x1b[90m',     // grey
};

function resolveCloudflared() {
  if (process.env.CLOUDFLARED_BIN) return process.env.CLOUDFLARED_BIN;
  if (platform() === 'win32') {
    const candidates = [
      'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
      'C:\\Program Files\\cloudflared\\cloudflared.exe',
    ];
    for (const c of candidates) if (existsSync(c)) return c;
    return 'cloudflared'; // fall back to PATH
  }
  if (platform() === 'linux') {
    const bundled = join(LOCAL_SERVER, 'bin', 'cloudflared');
    if (existsSync(bundled)) return bundled;
  }
  return 'cloudflared'; // macOS / PATH
}

function resolveTunnelConfig() {
  if (process.env.CLOUDFLARED_CONFIG) return process.env.CLOUDFLARED_CONFIG;
  const dir = join(homedir(), '.cloudflared');
  for (const name of ['config.yml', 'cardbox-config.yml']) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return join(dir, 'config.yml'); // best-effort; will error visibly if missing
}

const CLOUDFLARED_BIN = resolveCloudflared();
const TUNNEL_CONFIG = resolveTunnelConfig();
const NODE = process.execPath;

// Each process runs a plain node script or the cloudflared binary directly.
const PROCS = {
  frontend: { cmd: NODE, args: [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')], cwd: ROOT },
  server: { cmd: NODE, args: ['server.js'], cwd: LOCAL_SERVER, env: { PORT } },
  'ios-gw': { cmd: NODE, args: ['ios-share-gateway.js'], cwd: LOCAL_SERVER },
  'app-gw': { cmd: NODE, args: ['app-gateway.js'], cwd: LOCAL_SERVER },
  tunnel: { cmd: CLOUDFLARED_BIN, args: ['tunnel', '--config', TUNNEL_CONFIG, 'run'], cwd: ROOT },
};

const ALIASES = { backend: 'server', front: 'frontend', ui: 'frontend' };

const rawArgs = process.argv.slice(2);
const checkOnly = rawArgs.includes('--check');
const selected = rawArgs
  .filter((a) => !a.startsWith('--'))
  .map((a) => ALIASES[a] || a);

const names = selected.length ? selected : Object.keys(PROCS);
const unknown = names.filter((n) => !PROCS[n]);
if (unknown.length) {
  console.error(`Unknown process(es): ${unknown.join(', ')}`);
  console.error(`Valid names: ${Object.keys(PROCS).join(', ')} (aliases: ${Object.keys(ALIASES).join(', ')})`);
  process.exit(1);
}

function meta(msg) {
  console.log(`${COLORS.meta}[start-all] ${msg}${COLORS.reset}`);
}

meta(`platform=${platform()} node=${process.version}`);
meta(`backend PORT=${PORT}  (must match knowledge-api in ${TUNNEL_CONFIG})`);
meta(`cloudflared=${CLOUDFLARED_BIN}`);
meta(`running: ${names.join(', ')}`);

if (checkOnly) {
  meta('--check: not launching. Resolved plan:');
  for (const n of names) {
    const p = PROCS[n];
    console.log(`  ${n}: ${p.cmd} ${p.args.join(' ')}  (cwd=${p.cwd}${p.env ? `, env=${JSON.stringify(p.env)}` : ''})`);
  }
  if (names.includes('tunnel') && !existsSync(TUNNEL_CONFIG)) {
    console.error(`  WARNING: tunnel config not found: ${TUNNEL_CONFIG}`);
  }
  process.exit(0);
}

const children = [];
let shuttingDown = false;

function prefixLines(name, chunk) {
  const color = COLORS[name] || '';
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (line.length) process.stdout.write(`${color}[${name}]${COLORS.reset} ${line}\n`);
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  meta('shutting down…');
  for (const { name, child } of children) {
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill('SIGTERM'); } catch (e) { meta(`kill ${name} failed: ${e.message}`); }
    }
  }
  setTimeout(() => process.exit(code), 800).unref();
}

for (const name of names) {
  const p = PROCS[name];
  const child = spawn(p.cmd, p.args, {
    cwd: p.cwd,
    env: { ...process.env, ...(p.env || {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  children.push({ name, child });

  child.stdout.on('data', (c) => prefixLines(name, c));
  child.stderr.on('data', (c) => prefixLines(name, c));
  child.on('error', (err) => {
    meta(`${name} failed to start: ${err.message}`);
    if (name === 'tunnel' && err.code === 'ENOENT') {
      meta(`cloudflared not found. Install it or set CLOUDFLARED_BIN. On Windows: winget install --id Cloudflare.cloudflared`);
    }
  });
  child.on('exit', (code, signal) => {
    meta(`${name} exited (code=${code}, signal=${signal})`);
    if (!shuttingDown) shutdown(code ?? 1); // -k behaviour: one dies, all stop
  });
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => shutdown(0));
}
