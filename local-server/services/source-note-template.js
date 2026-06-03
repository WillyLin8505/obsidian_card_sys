import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_FILE = resolve(
  __dirname,
  process.env.SOURCE_NOTE_TEMPLATE_FILE || '../config/source-note-template.local.json'
);

export const DEFAULT_SOURCE_NOTE_TEMPLATE = {
  metadataFields: [
    { key: 'create date', defaultValue: '' },
    { key: 'aliases', defaultValue: '' },
    { key: 'tags', defaultValue: '3card/筆記法/卡片盒筆記法/文獻筆記' },
  ],
  bodyTemplate: `# 文獻筆記

## 來源資訊
- 作者：
- 標題：
- 連結：

## 重點摘要

## 文章內容

`,
};

function normalizeTemplate(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('文獻筆記模板格式錯誤');
  }
  if (!Array.isArray(value.metadataFields) || typeof value.bodyTemplate !== 'string') {
    throw new Error('文獻筆記模板必須包含 metadataFields 與 bodyTemplate');
  }

  const metadataFields = value.metadataFields.map(field => {
    if (!field || typeof field !== 'object' || typeof field.key !== 'string') {
      throw new Error('文獻筆記模板欄位格式錯誤');
    }
    return {
      key: field.key,
      defaultValue: typeof field.defaultValue === 'string' ? field.defaultValue : '',
    };
  });

  return { metadataFields, bodyTemplate: value.bodyTemplate };
}

export async function loadSourceNoteTemplate() {
  try {
    const raw = await readFile(TEMPLATE_FILE, 'utf-8');
    return { template: normalizeTemplate(JSON.parse(raw)), configured: true };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[source-note-template] load failed: ${err.message}`);
    }
    return { template: DEFAULT_SOURCE_NOTE_TEMPLATE, configured: false };
  }
}

export async function saveSourceNoteTemplate(value) {
  const template = normalizeTemplate(value);
  const tempFile = `${TEMPLATE_FILE}.tmp`;
  await mkdir(dirname(TEMPLATE_FILE), { recursive: true });
  await writeFile(tempFile, `${JSON.stringify(template, null, 2)}\n`, 'utf-8');
  await rename(tempFile, TEMPLATE_FILE);
  return template;
}

function yamlLinesForField(key, value) {
  if (key === 'tags' && value.trim()) {
    return [
      `${key}:`,
      ...value.split(',').map(tag => tag.trim()).filter(Boolean).map(tag => `  - ${tag}`),
    ];
  }
  return [`${key}: ${value}`];
}

export function buildSourceNoteFrontmatter(template, { sourceUrl, title, sourceType = 'ios-share' }) {
  const today = new Date().toISOString().split('T')[0];
  const fields = template.metadataFields
    .map(field => ({ ...field, key: field.key.trim() }))
    .filter(field => field.key);
  const seen = new Set(fields.map(field => field.key.toLowerCase()));
  const yamlLines = [];

  for (const field of fields) {
    const normalizedKey = field.key.toLowerCase();
    let value = field.defaultValue;
    if (normalizedKey === 'create date') value = today;
    if (normalizedKey === 'aliases' && !value.trim()) value = title || '';
    if (normalizedKey === 'source' && !value.trim()) value = sourceUrl || '';
    if (normalizedKey === 'source_type' && !value.trim()) value = sourceType;
    yamlLines.push(...yamlLinesForField(field.key, value));
  }

  if (!seen.has('source')) yamlLines.push(`source: ${sourceUrl || ''}`);
  if (!seen.has('source_type')) yamlLines.push(`source_type: ${sourceType}`);
  return `---\n${yamlLines.join('\n')}\n---\n\n`;
}

