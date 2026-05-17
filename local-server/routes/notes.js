import { Router } from 'express';
import { readdir, readFile, stat, writeFile, mkdir, realpath } from 'fs/promises';
import { join, extname, basename, dirname } from 'path';
import { assertAllowedVault, resolveUserPath } from '../security.js';

const router = Router();

// 記憶體快取：5 分鐘 TTL，避免 Obsidian 修改後永遠看不到更新
const CACHE_TTL_MS = 5 * 60 * 1000;
const notesCache = new Map(); // key: vaultPath + mode, value: { notes, timestamp }
const assetIndexCache = new Map(); // key: vaultPath, value: { byName, timestamp }
const assetIndexInflight = new Map(); // key: vaultPath, value: Promise<Map>
const fileNoteCache = new Map(); // key: vaultPath, value: Map<filePath, { mtimeMs, size, note }>
const mdFileListCache = new Map(); // key: vaultPath, value: filePath[]

function notesCacheKey(vaultPath, summary = false) {
  return `${vaultPath}\0${summary ? 'summary' : 'full'}`;
}

function getCached(vaultPath, summary = false) {
  const key = notesCacheKey(vaultPath, summary);
  const entry = notesCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    notesCache.delete(key);
    return null;
  }
  return entry.notes;
}

function setCache(vaultPath, notes, summary = false) {
  notesCache.set(notesCacheKey(vaultPath, summary), { notes, timestamp: Date.now() });
}

function invalidateCache(vaultPath) {
  notesCache.delete(notesCacheKey(vaultPath, false));
  notesCache.delete(notesCacheKey(vaultPath, true));
  assetIndexCache.delete(vaultPath);
  assetIndexInflight.delete(vaultPath);
  mdFileListCache.delete(vaultPath);
}

function getFileNoteCache(vaultPath) {
  let cache = fileNoteCache.get(vaultPath);
  if (!cache) {
    cache = new Map();
    fileNoteCache.set(vaultPath, cache);
  }
  return cache;
}

function resolvePath(p) {
  return resolveUserPath(p);
}

// Resolve symlinks and verify filePath is inside vaultPath.
// For files that don't yet exist, resolves the parent directory instead.
async function isWithinVault(vaultPath, filePath) {
  try {
    const realVault = await realpath(vaultPath);
    let realFile;
    try {
      realFile = await realpath(filePath);
    } catch {
      // File doesn't exist yet — resolve parent dir and reconstruct
      const realParent = await realpath(dirname(filePath)).catch(() => dirname(filePath));
      realFile = join(realParent, basename(filePath));
    }
    return realFile === realVault || realFile.startsWith(realVault + '/');
  } catch {
    return false;
  }
}

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { meta: {}, body: content };

  const meta = {};
  const frontmatter = {};
  const raw = match[1];
  const rawLines = raw.split('\n');

  for (let i = 0; i < rawLines.length; i++) {
    const kv = rawLines[i].match(/^([^:]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    let value = kv[2].trim().replace(/^["']|["']$/g, '');
    const listItems = [];
    while (i + 1 < rawLines.length && rawLines[i + 1].match(/^\s+-\s*.+/)) {
      i++;
      listItems.push(rawLines[i].replace(/^\s+-\s*/, '').trim());
    }
    if (listItems.length > 0) value = listItems.join(', ');
    frontmatter[key] = value;
  }
  meta.frontmatter = frontmatter;

  // title
  const titleMatch = raw.match(/^title:\s*(.+)$/m);
  if (titleMatch) meta.title = titleMatch[1].trim().replace(/^["']|["']$/g, '');

  // tags (list format: "  - tag" or inline: "tags: [a, b]")
  const tagsInline = raw.match(/^tags:\s*\[([^\]]*)\]/m);
  const tagsBlock = raw.match(/^tags:\s*\n((?:\s+-\s*.+\n?)+)/m);
  if (tagsInline) {
    meta.tags = tagsInline[1].split(',').map(t => t.trim()).filter(Boolean);
  } else if (tagsBlock) {
    meta.tags = tagsBlock[1]
      .split('\n')
      .map(l => l.replace(/^\s+-\s*/, '').trim())
      .filter(Boolean);
  } else {
    meta.tags = [];
  }

  // created date
  const dateMatch = raw.match(/^create\s*date:\s*(.+)$/m);
  if (dateMatch) meta.createdAt = dateMatch[1].trim();

  const body = content.slice(match[0].length);
  return { meta, body };
}

function inferType(tags) {
  const flat = tags.join('/').toLowerCase();
  if (flat.includes('靈感') || flat.includes('fleet') || flat.includes('閃念')) return 'fleet';
  if (flat.includes('文獻') || flat.includes('source')) return 'source';
  return 'permanent';
}

async function walkMd(dir, files = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      await walkMd(full, files);
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      files.push(full);
    }
  }
  return files;
}

async function getMdFilePaths(vaultPath, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = mdFileListCache.get(vaultPath);
    if (cached) return cached;
  }
  const filePaths = await walkMd(vaultPath);
  mdFileListCache.set(vaultPath, filePaths);
  return filePaths;
}

async function walkFiles(dir, files = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      await walkFiles(full, files);
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

const ASSET_CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
};

function isSupportedAsset(filePath) {
  return Boolean(ASSET_CONTENT_TYPES[extname(filePath).toLowerCase()]);
}

function buildNoteFromFile(filePath, vaultPath, content, fileStat) {
  const { meta } = parseFrontmatter(content);
  const fileName = basename(filePath, '.md');
  const relativePath = filePath.replace(vaultPath, '').replace(/^\//, '');

  return {
    id: relativePath,
    title: meta.title || fileName,
    content,
    frontmatter: meta.frontmatter || {},
    type: inferType(meta.tags || []),
    tags: meta.tags || [],
    links: [],
    createdAt: meta.createdAt || fileStat.birthtime.toISOString(),
    updatedAt: fileStat.mtime.toISOString(),
  };
}

function stripMarkdownForSummary(content) {
  return content
    .replace(/^---\s*\n[\s\S]*?\n---\s*\n*/, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\[\[([^\]|#\n]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*|__|\*|_|~~|`/g, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildNoteSummary(note) {
  const bodyText = stripMarkdownForSummary(note.content);
  return {
    ...note,
    content: bodyText.slice(0, 600),
    searchText: [note.title, ...(note.tags || []), bodyText].join(' ').slice(0, 4000),
  };
}

async function getAssetIndex(vaultPath) {
  const cached = assetIndexCache.get(vaultPath);
  if (cached && Date.now() - cached.timestamp <= CACHE_TTL_MS) {
    return cached.byName;
  }

  const inflight = assetIndexInflight.get(vaultPath);
  if (inflight) return inflight;

  const build = (async () => {
    const byName = new Map();
    const allFiles = await walkFiles(vaultPath);
    for (const filePath of allFiles) {
      if (!isSupportedAsset(filePath)) continue;
      const key = basename(filePath).toLowerCase();
      if (!byName.has(key)) byName.set(key, filePath);
    }
    assetIndexCache.set(vaultPath, { byName, timestamp: Date.now() });
    return byName;
  })().finally(() => {
    assetIndexInflight.delete(vaultPath);
  });

  assetIndexInflight.set(vaultPath, build);
  return build;
}

// Read files in batches to avoid exhausting file descriptors / memory
async function readFilesInBatches(filePaths, vaultPath, batchSize = 20) {
  const results = [];
  const perFileCache = getFileNoteCache(vaultPath);
  const seen = new Set(filePaths);

  for (let i = 0; i < filePaths.length; i += batchSize) {
    const batch = filePaths.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (filePath) => {
        try {
          const fileStat = await stat(filePath);
          const cached = perFileCache.get(filePath);
          if (cached && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
            return cached.note;
          }

          const content = await readFile(filePath, 'utf-8');
          const note = buildNoteFromFile(filePath, vaultPath, content, fileStat);
          perFileCache.set(filePath, {
            mtimeMs: fileStat.mtimeMs,
            size: fileStat.size,
            note,
          });
          return note;
        } catch {
          perFileCache.delete(filePath);
          return null;
        }
      })
    );
    results.push(...batchResults);
  }

  for (const cachedPath of perFileCache.keys()) {
    if (!seen.has(cachedPath)) perFileCache.delete(cachedPath);
  }

  return results;
}

// Normalize a filename the same way qmd does: collapse " - " and spaces around hyphens
function normalizeName(name) {
  return name.toLowerCase().replace(/\s*-\s*/g, '-').replace(/\s+/g, '-');
}

// GET /notes/file?vault=<vaultPath>&file=<relativePath>  — single file, fast
router.get('/file', async (req, res) => {
  const { vault, file } = req.query;
  if (!vault || !file) return res.status(400).json({ error: 'vault and file query params required' });

  let vaultPath;
  try {
    vaultPath = await assertAllowedVault(vault);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }
  let filePath = join(vaultPath, file);

  if (!await isWithinVault(vaultPath, filePath)) {
    return res.status(403).json({ error: 'Path traversal not allowed' });
  }

  // If exact path doesn't exist, search the directory for a name that normalizes to the same value
  try {
    await stat(filePath);
  } catch {
    const dir = dirname(filePath);
    const targetName = normalizeName(basename(file, '.md'));
    try {
      const entries = await readdir(dir);
      const match = entries.find(e => extname(e) === '.md' && normalizeName(basename(e, '.md')) === targetName);
      if (match) filePath = join(dir, match);
    } catch {
      // dir unreadable — fall through to original path so error message is meaningful
    }
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    const fileStat = await stat(filePath);
    res.json(buildNoteFromFile(filePath, vaultPath, content, fileStat));
  } catch (err) {
    res.status(500).json({ error: `Cannot read file: ${err.message}` });
  }
});

// GET /notes/asset?vault=<vaultPath>&file=<relativeOrBasename>&from=<noteRelativePath>
router.get('/asset', async (req, res) => {
  const { vault, file, from } = req.query;
  if (!vault || !file) return res.status(400).json({ error: 'vault and file query params required' });

  let vaultPath;
  try {
    vaultPath = await assertAllowedVault(vault);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }
  const requested = String(file);
  const candidatePaths = [];

  if (from) {
    candidatePaths.push(join(vaultPath, dirname(String(from)), requested));
  }
  candidatePaths.push(join(vaultPath, requested));

  let filePath = null;
  for (const candidate of candidatePaths) {
    if (!await isWithinVault(vaultPath, candidate)) continue;
    try {
      const fileStat = await stat(candidate);
      if (fileStat.isFile() && isSupportedAsset(candidate)) {
        filePath = candidate;
        break;
      }
    } catch {
      // Try the next candidate.
    }
  }

  if (!filePath && !requested.includes('/')) {
    const targetName = requested.toLowerCase();
    const assetIndex = await getAssetIndex(vaultPath);
    const match = assetIndex.get(targetName);
    if (match && await isWithinVault(vaultPath, match)) {
      filePath = match;
    }
  }

  if (!filePath) return res.status(404).json({ error: `Asset not found: ${requested}` });

  try {
    res.setHeader('Content-Type', ASSET_CONTENT_TYPES[extname(filePath).toLowerCase()]);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: `Cannot read asset: ${err.message}` });
  }
});

// POST /notes — create a new .md file in the vault
router.post('/', async (req, res) => {
  const { vaultPath: bodyVaultPath, filename, content } = req.body;
  if (!bodyVaultPath || !filename || content === undefined) {
    return res.status(400).json({ error: 'vaultPath, filename, and content are required' });
  }

  let vaultPath;
  try {
    vaultPath = await assertAllowedVault(bodyVaultPath);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }
  const safeName = filename.endsWith('.md') ? filename : `${filename}.md`;
  const filePath = join(vaultPath, safeName);

  if (!await isWithinVault(vaultPath, filePath)) {
    return res.status(403).json({ error: 'Path traversal not allowed' });
  }

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf-8');
    invalidateCache(vaultPath);
    res.json({ ok: true, relativePath: safeName });
  } catch (err) {
    res.status(500).json({ error: `Cannot create file: ${err.message}` });
  }
});

router.put('/', async (req, res) => {
  const { relativePath, vaultPath: bodyVaultPath, content } = req.body;
  if (!relativePath || !bodyVaultPath || content === undefined) {
    return res.status(400).json({ error: 'relativePath, vaultPath, and content are required' });
  }

  let vaultPath;
  try {
    vaultPath = await assertAllowedVault(bodyVaultPath);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }
  const filePath = join(vaultPath, relativePath);

  if (!await isWithinVault(vaultPath, filePath)) {
    return res.status(403).json({ error: 'Path traversal not allowed' });
  }

  try {
    const { writeFile } = await import('fs/promises');
    await writeFile(filePath, content, 'utf-8');
    invalidateCache(vaultPath);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: `Cannot write file: ${err.message}` });
  }
});

// POST /notes/reload?path=<vaultPath> — 清除快取，強制重新讀取
router.post('/reload', async (req, res) => {
  const rawPath = req.query.path;
  if (!rawPath) return res.status(400).json({ error: 'path query param required' });
  let vaultPath;
  try {
    vaultPath = await assertAllowedVault(rawPath);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }
  const summary = req.query.summary === '1';
  console.log(`[reload] vaultPath = ${vaultPath}`);
  invalidateCache(vaultPath);
  try {
    const filePaths = await getMdFilePaths(vaultPath, true);
    console.log(`[reload] found ${filePaths.length} .md files`);
    // Log any file whose name contains the search term for debugging
    filePaths.forEach(p => { if (p.includes('巨人')) console.log(`[reload] matched: ${p}`); });
    const notes = await readFilesInBatches(filePaths, vaultPath);
    const result = notes.filter(Boolean);
    setCache(vaultPath, result);
    if (summary) {
      const summaries = result.map(buildNoteSummary);
      setCache(vaultPath, summaries, true);
      res.json(summaries);
      return;
    }
    res.json(result);
  } catch (err) {
    console.error(`[reload] error:`, err);
    res.status(500).json({ error: `Cannot read vault: ${err.message}` });
  }
});

router.get('/', async (req, res) => {
  const rawPath = req.query.path;
  if (!rawPath) return res.status(400).json({ error: 'path query param required' });

  let vaultPath;
  try {
    vaultPath = await assertAllowedVault(rawPath);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }
  const summary = req.query.summary === '1';

  const cached = getCached(vaultPath, summary);
  if (cached) return res.json(cached);

  try {
    const filePaths = await getMdFilePaths(vaultPath);
    const notes = await readFilesInBatches(filePaths, vaultPath);
    const result = notes.filter(Boolean);
    setCache(vaultPath, result);
    if (summary) {
      const summaries = result.map(buildNoteSummary);
      setCache(vaultPath, summaries, true);
      res.json(summaries);
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: `Cannot read vault: ${err.message}` });
  }
});

export default router;
