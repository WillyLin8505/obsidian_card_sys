import { realpath } from 'fs/promises';
import { homedir } from 'os';
import { dirname, join } from 'path';

export function resolveUserPath(p) {
  if (typeof p !== 'string') return '';
  const trimmed = p.trim();
  if (trimmed.startsWith('~')) return join(homedir(), trimmed.slice(1));
  // Convert Windows-style paths to WSL paths (e.g. D:\foo\bar → /mnt/d/foo/bar)
  const winMatch = trimmed.match(/^([A-Za-z]):[/\\](.*)/);
  if (winMatch) {
    const drive = winMatch[1].toLowerCase();
    const rest = winMatch[2].replace(/\\/g, '/');
    return `/mnt/${drive}/${rest}`;
  }
  return trimmed;
}

const configuredVaults = (process.env.OBSIDIAN_VAULT_PATHS || process.env.ALLOWED_VAULT_PATHS || '')
  .split(',')
  .map(p => resolveUserPath(p.trim()))
  .filter(Boolean);

let warnedMissingVaultAllowlist = false;

async function realPathOrParent(path) {
  try {
    return await realpath(path);
  } catch {
    const parent = await realpath(dirname(path)).catch(() => dirname(path));
    return join(parent, path.split('/').pop() || '');
  }
}

export async function isWithinPath(rootPath, targetPath) {
  try {
    const realRoot = await realpath(rootPath);
    const realTarget = await realPathOrParent(targetPath);
    return realTarget === realRoot || realTarget.startsWith(realRoot + '/');
  } catch {
    return false;
  }
}

export async function assertAllowedVault(vaultPath) {
  const resolvedVault = resolveUserPath(vaultPath);

  if (configuredVaults.length === 0) {
    if (!warnedMissingVaultAllowlist) {
      console.warn('[security] OBSIDIAN_VAULT_PATHS is not set; accepting client-provided vault paths for compatibility.');
      warnedMissingVaultAllowlist = true;
    }
    return resolvedVault;
  }

  for (const allowedVault of configuredVaults) {
    if (await isWithinPath(allowedVault, resolvedVault)) {
      return resolvedVault;
    }
  }

  const err = new Error('Vault path is not allowed');
  err.status = 403;
  throw err;
}
