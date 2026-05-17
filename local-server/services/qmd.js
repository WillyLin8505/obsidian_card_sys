import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const QMD_TIMEOUT_MS = 300000; // 5 minutes (model download on first run)

function getQmdPath() {
  return process.env.QMD_PATH || '/home/sssss/.bun/bin/qmd';
}

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
  const query = question.replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();

  try {
    const { stdout, stderr } = await execFileAsync(
      getQmdPath(),
      ['search', query, '-c', 'obsidian', '--json'],
      { timeout: QMD_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 5 }
    );

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
      throw new Error('QMD is not installed or not in PATH. Set QMD_PATH env var.');
    }
    throw new Error(`QMD failed: ${err.message}`);
  }
}

export async function qmdHealthCheck() {
  try {
    const { stdout } = await execFileAsync(getQmdPath(), ['status'], { timeout: 5000 });
    return { ok: true, version: stdout.split('\n')[0].trim() };
  } catch {
    return { ok: false, version: null };
  }
}
