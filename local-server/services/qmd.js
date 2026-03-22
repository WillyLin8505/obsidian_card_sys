import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const QMD_TIMEOUT_MS = 300000; // 5 minutes (model download on first run)

/**
 * Parse qmd query stdout into NoteChunk array.
 * QMD outputs results as plain text blocks separated by blank lines.
 * Each block typically contains a file path line and content lines.
 * Adjust this parser if your qmd version outputs different formatting.
 */
function parseQmdOutput(stdout) {
  const chunks = [];
  const raw = stdout.trim();

  if (!raw) return chunks;

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => ({
        content: item.snippet || item.content || '',
        notePath: (item.file || '').replace('qmd://obsidian/', ''),
        similarity: typeof item.score === 'number' ? item.score : 0.5,
        metadata: {
          title: item.title || undefined,
        },
      }));
    }
  } catch {
    // not JSON
  }

  return chunks;
}

export async function qmdQuery(question) {
  // Sanitize question to prevent shell injection
  const sanitized = question.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  const command = `/home/willylin/.bun/bin/qmd search "${sanitized}" --json`;

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: QMD_TIMEOUT_MS,
      maxBuffer: 1024 * 1024 * 5, // 5MB
    });

    if (stderr && !stdout) {
      throw new Error(`QMD error: ${stderr.trim()}`);
    }

    const chunks = parseQmdOutput(stdout);
    return { chunks, raw: stdout };
  } catch (err) {
    if (err.killed || err.signal === 'SIGTERM') {
      throw new Error(`QMD query timed out after ${QMD_TIMEOUT_MS / 1000}s`);
    }
    if (err.code === 127 || (err.message && err.message.includes('not found'))) {
      throw new Error('QMD is not installed or not in PATH. Run: pip install qmd');
    }
    throw new Error(`QMD failed: ${err.message}`);
  }
}

export async function qmdHealthCheck() {
  try {
    const { stdout } = await execAsync('/home/willylin/.bun/bin/qmd status', { timeout: 5000 });
    return { ok: true, version: stdout.split('\n')[0].trim() };
  } catch {
    return { ok: false, version: null };
  }
}
