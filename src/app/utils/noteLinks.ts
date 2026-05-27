function stripMarkdownExt(value: string): string {
  return value.replace(/\.md$/i, '');
}

function decodeLinkTarget(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function cleanMarkdownDestination(value: string): string {
  let target = value.trim();
  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1).trim();
  }
  return cleanLinkTarget(target);
}

function cleanLinkTarget(value: string): string {
  return decodeLinkTarget(value)
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .split(/[?#]/)[0]
    .trim();
}

function markdownDestination(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('<')) {
    const end = trimmed.indexOf('>');
    return end >= 0 ? trimmed.slice(0, end + 1) : trimmed;
  }

  let quote: string | null = null;
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if ((char === '"' || char === "'") && (i === 0 || /\s/.test(trimmed[i - 1]))) {
      quote = quote === char ? null : char;
      continue;
    }
    if (!quote && /\s/.test(char)) {
      const rest = trimmed.slice(i).trim();
      if (/^["'(]/.test(rest)) return trimmed.slice(0, i);
    }
  }

  return trimmed;
}

function noteName(value: string): string {
  return value.split('/').pop()?.replace(/\.md$/i, '') ?? value;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

export function normalizeNoteLinkKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = cleanLinkTarget(value);
  const normalized = cleaned
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return normalized || null;
}

export function noteLinkAliases(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const cleaned = cleanLinkTarget(value);
  const decoded = decodeLinkTarget(value).trim();
  return unique([cleaned, decoded].flatMap(candidate => [
    candidate,
    stripMarkdownExt(candidate),
    noteName(candidate),
    stripMarkdownExt(noteName(candidate)),
  ]));
}

export function parseWikiLinks(content: string): string[] {
  return [...content.matchAll(/\[\[([^\]|#\n]+?)(?:\|[^\]]+)?\]\]/g)].map(m => m[1].trim());
}

export type MarkdownLinkRecord = {
  label: string;
  target: string;
  candidates: string[];
  isLocalNote: boolean;
};

function isLocalNoteTarget(value: string): boolean {
  return Boolean(value)
    && !/^[a-z][a-z0-9+.-]*:/i.test(value)
    && !value.startsWith('#')
    && /\.md$/i.test(value);
}

export function parseMarkdownLinkRecords(content: string): MarkdownLinkRecord[] {
  return [...content.matchAll(/(?<!!)\[([^\]\n]*)]\(([^)\n]*)\)/g)]
    .map(match => {
      const label = match[1].trim();
      const target = cleanMarkdownDestination(markdownDestination(match[2]));
      const candidates = unique([
        label,
        label ? `${label}.md` : '',
        target,
        stripMarkdownExt(target),
        noteName(target),
      ]);
      return {
        label,
        target,
        candidates,
        isLocalNote: isLocalNoteTarget(target),
      };
    });
}

export function parseMarkdownLinks(content: string): string[] {
  return parseMarkdownLinkRecords(content).flatMap(record => record.candidates);
}

export function parseFrontmatterLinks(content: string): string[] {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return [];

  const fm = match[1];
  const values: string[] = [];
  const fields = ['connect', 'connections', 'links', 'link', '連結'];
  const fieldPattern = fields.map(field => field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const blockRe = new RegExp(`^(${fieldPattern}):\\s*(.*)$`, 'gmi');
  let fieldMatch: RegExpExecArray | null;

  while ((fieldMatch = blockRe.exec(fm)) !== null) {
    const rest = fieldMatch[2].trim();
    const afterField = fm.slice(blockRe.lastIndex);
    const listMatch = afterField.match(/^\n((?:[ \t]+-[^\n]*\n?)*)/);

    if (rest.startsWith('[') && rest.endsWith(']')) {
      rest.slice(1, -1).split(',').forEach(item => values.push(item));
    } else if (rest) {
      values.push(rest);
    }

    if (listMatch?.[1]) {
      listMatch[1]
        .split('\n')
        .map(line => line.replace(/^[ \t]+-[ \t]*/, '').trim())
        .filter(Boolean)
        .forEach(item => values.push(item));
    }
  }

  return unique(values
    .map(value => value.trim().replace(/^["']|["']$/g, ''))
    .flatMap(value => {
      const wikiLinks = parseWikiLinks(value);
      const markdownLinks = parseMarkdownLinks(value);
      if (wikiLinks.length > 0 || markdownLinks.length > 0) return [...wikiLinks, ...markdownLinks];
      return [value];
    })
    .map(value => value.replace(/^\[\[|\]\]$/g, '').split('|')[0].trim()));
}
