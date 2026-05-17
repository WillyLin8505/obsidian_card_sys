import { Router } from 'express';
import { spawn } from 'child_process';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { assertAllowedVault } from '../security.js';

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

// POST /enrich-vault
// Body: { vaultPath: string }
// Responds immediately; runs vault-wide enrichment in background.
router.post('/', async (req, res) => {
  const { vaultPath } = req.body;
  if (!vaultPath || typeof vaultPath !== 'string') {
    return res.status(400).json({ error: 'vaultPath is required' });
  }

  let safeVaultPath;
  try {
    safeVaultPath = resolve(await assertAllowedVault(vaultPath));
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }
  res.json({ ok: true });

  const enrichScript = join(SCRIPTS_DIR, 'enrich_notes.py');
  const SEARCH_SERVER_URL = process.env.SEARCH_SERVER_URL || 'http://127.0.0.1:8765';

  let stdout;
  try {
    stdout = await runScript('python3', [enrichScript, '--vault', safeVaultPath], 600_000);
  } catch (err) {
    console.error('[enrich-vault] enrichment failed:', err.message);
    return;
  }

  // Parse which files were enriched (lines like "[1/10] ✓ relative/path.md")
  const enrichedRelPaths = [];
  for (const line of stdout.split('\n')) {
    const m = line.match(/^\[\d+\/\d+\]\s+✓\s+(.+\.md)/);
    if (m) enrichedRelPaths.push(m[1].trim());
  }

  const summaryMatch = stdout.match(/enriched=(\d+)/);
  const count = summaryMatch ? parseInt(summaryMatch[1]) : enrichedRelPaths.length;
  console.log(`[enrich-vault] enriched ${count} notes`);

  if (enrichedRelPaths.length === 0) return;

  // Update search index for each enriched note (sequential to avoid GPU OOM)
  const updateScript = join(LLAMA_DIR, 'update_one.py');
  for (const rel of enrichedRelPaths) {
    const fullPath = resolve(join(safeVaultPath, rel));
    try {
      await runScript(VENV_PYTHON, [updateScript, fullPath], 120_000);
      console.log(`[enrich-vault] indexed: ${rel}`);
    } catch (e) {
      console.error(`[enrich-vault] index failed for ${rel}: ${e.message}`);
    }
  }

  // Reload search server once after all updates
  try {
    await fetch(`${SEARCH_SERVER_URL}/reload`, { method: 'POST' });
    console.log('[enrich-vault] search server reloaded');
  } catch (e) {
    console.error('[enrich-vault] reload failed:', e.message);
  }
});

export default router;
