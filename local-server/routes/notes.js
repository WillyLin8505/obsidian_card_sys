import { Router } from 'express';
import { readdir, readFile, stat } from 'fs/promises';
import { join, extname, basename } from 'path';
import { homedir } from 'os';

const router = Router();

function resolvePath(p) {
  if (p.startsWith('~')) return join(homedir(), p.slice(1));
  return p;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { meta: {}, body: content };

  const meta = {};
  const raw = match[1];

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

// GET /notes/file?vault=<vaultPath>&file=<relativePath>  — single file, fast
router.get('/file', async (req, res) => {
  const { vault, file } = req.query;
  if (!vault || !file) return res.status(400).json({ error: 'vault and file query params required' });

  const vaultPath = resolvePath(vault);
  const filePath = join(vaultPath, file);

  if (!filePath.startsWith(vaultPath)) {
    return res.status(403).json({ error: 'Path traversal not allowed' });
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    const fileStat = await stat(filePath);
    const { meta } = parseFrontmatter(content);
    const fileName = basename(filePath, '.md');

    res.json({
      id: file,
      title: meta.title || fileName,
      content,
      type: inferType(meta.tags || []),
      tags: meta.tags || [],
      links: [],
      createdAt: meta.createdAt || fileStat.birthtime.toISOString(),
      updatedAt: fileStat.mtime.toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: `Cannot read file: ${err.message}` });
  }
});

router.put('/', async (req, res) => {
  const { relativePath, vaultPath: bodyVaultPath, content } = req.body;
  if (!relativePath || !bodyVaultPath || content === undefined) {
    return res.status(400).json({ error: 'relativePath, vaultPath, and content are required' });
  }

  const vaultPath = resolvePath(bodyVaultPath);
  const filePath = join(vaultPath, relativePath);

  // Safety check: ensure the resolved path is inside the vault
  if (!filePath.startsWith(vaultPath)) {
    return res.status(403).json({ error: 'Path traversal not allowed' });
  }

  try {
    const { writeFile } = await import('fs/promises');
    await writeFile(filePath, content, 'utf-8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: `Cannot write file: ${err.message}` });
  }
});

router.get('/', async (req, res) => {
  const rawPath = req.query.path;
  if (!rawPath) return res.status(400).json({ error: 'path query param required' });

  const vaultPath = resolvePath(rawPath);

  try {
    const filePaths = await walkMd(vaultPath);
    const notes = await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          const content = await readFile(filePath, 'utf-8');
          const fileStat = await stat(filePath);
          const { meta } = parseFrontmatter(content);
          const fileName = basename(filePath, '.md');
          const relativePath = filePath.replace(vaultPath, '').replace(/^\//, '');

          return {
            id: relativePath,
            title: meta.title || fileName,
            content,
            type: inferType(meta.tags || []),
            tags: meta.tags || [],
            links: [],
            createdAt: meta.createdAt || fileStat.birthtime.toISOString(),
            updatedAt: fileStat.mtime.toISOString(),
          };
        } catch {
          return null;
        }
      })
    );

    res.json(notes.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: `Cannot read vault: ${err.message}` });
  }
});

export default router;
