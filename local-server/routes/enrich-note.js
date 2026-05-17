import { Router } from 'express';
import { spawn } from 'child_process';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { assertAllowedVault, isWithinPath } from '../security.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(__dirname, '..', 'scripts');
const LLAMA_DIR = join(__dirname, '..', '..', 'llama-search');
const VENV_PYTHON = join(LLAMA_DIR, '.venv-wsl', 'bin', 'python');

const router = Router();

function runScript(bin, args, timeoutMs = 300_000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error('timeout')); }, timeoutMs);
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `exit code ${code}`));
    });
    proc.on('error', err => { clearTimeout(timer); reject(err); });
  });
}

// POST /enrich-note
// Body: { relativePath: string, vaultPath: string }
router.post('/', async (req, res) => {
  const { relativePath, vaultPath } = req.body;
  if (!relativePath || !vaultPath) {
    return res.status(400).json({ error: 'relativePath and vaultPath are required' });
  }

  let safeVaultPath;
  try {
    safeVaultPath = await assertAllowedVault(vaultPath);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const fullPath = resolve(join(safeVaultPath, relativePath));
  if (!await isWithinPath(safeVaultPath, fullPath)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  try {
    // Step 1: enrich abstract + connect via Claude CLI (blocking — must finish before responding)
    const enrichScript = join(SCRIPTS_DIR, 'enrich_notes.py');
    await runScript('python3', [enrichScript, '--file', fullPath], 300_000);

    // Step 2: respond immediately, update search index in background
    res.json({ ok: true, path: relativePath });

    const SEARCH_SERVER_URL = process.env.SEARCH_SERVER_URL || 'http://127.0.0.1:8765';
    const updateScript = join(LLAMA_DIR, 'update_one.py');
    runScript(VENV_PYTHON, [updateScript, fullPath], 120_000)
      .then(() => {
        console.log(`[enrich-note] index updated: ${relativePath}`);
        return fetch(`${SEARCH_SERVER_URL}/reload`, { method: 'POST' });
      })
      .then(() => console.log(`[enrich-note] search server reloaded`))
      .catch(e => console.error(`[enrich-note] post-update failed: ${e.message}`));
  } catch (err) {
    console.error('[enrich-note] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
