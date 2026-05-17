import { execFile, execFileSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function cleanEnvForClaude() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT'].includes(k))
  );
}

function findCliPath(name, envVar, fallbacks = []) {
  if (process.env[envVar]) return process.env[envVar];
  try {
    return execFileSync('which', [name], { encoding: 'utf8' }).trim();
  } catch {
    for (const p of fallbacks) {
      if (existsSync(p)) return p;
    }
    return null;
  }
}

export function getClaudePath() {
  return findCliPath('claude', 'CLAUDE_BIN', [
    `${process.env.HOME}/.npm-global/bin/claude`,
    '/home/willylin/.npm-global/bin/claude',
    '/usr/local/bin/claude',
  ]);
}

export function getCodexPath() {
  return findCliPath('codex', 'CODEX_BIN', [
    `${process.env.HOME}/.nvm/versions/node/v22.22.2/bin/codex`,
    `${process.env.HOME}/.npm-global/bin/codex`,
    '/usr/local/bin/codex',
  ]);
}

async function runClaude(prompt, options) {
  const claudePath = getClaudePath();
  if (!claudePath) {
    throw new Error('claude CLI not found. Install it or set CLAUDE_BIN environment variable.');
  }

  const args = ['-p', prompt, '--output-format', 'text'];
  if (options.claudeModel) args.push('--model', options.claudeModel);

  const { stdout } = await execFileAsync(claudePath, args, {
    timeout: options.timeoutMs,
    env: cleanEnvForClaude(),
    maxBuffer: options.maxBuffer,
  });

  return stdout.trim();
}

async function runCodex(prompt, options) {
  const codexPath = getCodexPath();
  if (!codexPath) {
    throw new Error('codex CLI not found. Install it or set CODEX_BIN environment variable.');
  }

  const output = await spawnCodex(codexPath, [
    '-a',
    'never',
    'exec',
    '--skip-git-repo-check',
    '--ephemeral',
    '-s',
    'read-only',
    '--json',
    '--color',
    'never',
    prompt,
  ], options);

  return extractCodexJson(output);
}

function spawnCodex(codexPath, args, options) {
  return new Promise((resolve, reject) => {
    const proc = spawn(codexPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`codex CLI timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);

    const collect = (chunk, stream) => {
      outputBytes += chunk.length;
      if (outputBytes > options.maxBuffer) {
        proc.kill('SIGTERM');
        reject(new Error('codex CLI output exceeded maxBuffer'));
        return;
      }
      if (stream === 'stdout') stdout += chunk.toString();
      else stderr += chunk.toString();
    };

    proc.stdout.on('data', (chunk) => collect(chunk, 'stdout'));
    proc.stderr.on('data', (chunk) => collect(chunk, 'stderr'));
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const combined = `${stdout}\n${stderr}`;
      if (code === 0) resolve(combined);
      else reject(new Error(combined.trim() || `codex CLI failed with exit code ${code}`));
    });

    proc.stdin.end();
  });
}

function extractCodexJson(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return '';

  let lastMessage = '';
  for (const line of text.split('\n')) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
        lastMessage = event.item.text || '';
      }
    } catch {
      // Ignore non-JSON progress lines such as "Reading additional input from stdin...".
    }
  }

  return lastMessage.trim();
}

function compactError(err) {
  const stderr = err.stderr ? String(err.stderr).trim() : '';
  const message = stderr || err.message || String(err);
  return message.split('\n').slice(-4).join('\n');
}

export async function runAiCliText(prompt, options = {}) {
  const merged = {
    label: 'ai-cli',
    claudeModel: null,
    timeoutMs: 120_000,
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  };

  try {
    const text = await runClaude(prompt, merged);
    console.log(`[${merged.label}] AI backend: claude`);
    return { text, backend: 'claude' };
  } catch (claudeErr) {
    console.warn(`[${merged.label}] Claude unavailable, falling back to Codex: ${compactError(claudeErr)}`);

    try {
      const text = await runCodex(prompt, merged);
      console.log(`[${merged.label}] AI backend: codex`);
      return { text, backend: 'codex' };
    } catch (codexErr) {
      throw new Error(
        `Claude and Codex CLI both failed. Claude: ${compactError(claudeErr)} | Codex: ${compactError(codexErr)}`
      );
    }
  }
}
