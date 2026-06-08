#!/usr/bin/env node
// Event-driven git auto-sync: watches the repo with native macOS FSEvents and
// runs scripts/git-sync.sh (debounced) only when files actually change.
// No timer — git-sync.sh itself no-ops when there is nothing to commit/push.

const fsevents = require('fsevents');
const { execFile } = require('child_process');
const path = require('path');

const REPO = '/Users/willylin/Desktop/vibe_coding/obsidian_card_sys';
const SCRIPT = path.join(REPO, 'scripts', 'git-sync.sh');
const DEBOUNCE_MS = 10000; // batch a burst of saves into one commit

// Ignore noise that must never trigger a sync.
const IGNORE = [
  '/.git/', '/node_modules/', '/dist/', '/.venv/', '/venv/',
  '/storage/', '/__pycache__/', 'git-sync.log', '.DS_Store',
];

let timer = null;
let running = false;
let queued = false;

function runSync() {
  if (running) { queued = true; return; }
  running = true;
  execFile('/bin/bash', [SCRIPT], { cwd: REPO }, (err) => {
    running = false;
    if (err) console.error('[git-sync] script error:', err.message);
    else console.log('[git-sync] sync run complete', new Date().toISOString());
    if (queued) { queued = false; schedule(); }
  });
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(runSync, DEBOUNCE_MS);
}

const stop = fsevents.watch(REPO, (p) => {
  if (IGNORE.some((frag) => p.includes(frag))) return;
  schedule();
});

console.log('[git-sync] watcher started on', REPO, '(debounce', DEBOUNCE_MS + 'ms)');

function shutdown() { try { stop(); } catch {} process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
