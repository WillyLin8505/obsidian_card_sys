const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---(?:\n|$)/;

function extractFrontmatterBlock(content: string): string | null {
  const match = content.match(FRONTMATTER_RE);
  return match ? match[1] : null;
}

export function parseFrontmatterKeys(content: string): string[] {
  const block = extractFrontmatterBlock(content);
  if (!block) return [];

  const keys: string[] = [];
  for (const line of block.split('\n')) {
    const m = line.match(/^([^:\s][^:]*?):/);
    if (m && !line.startsWith('  ')) {
      keys.push(m[1].trim());
    }
  }
  return keys;
}

export function parseFrontmatterValue(content: string, key: string): string {
  const block = extractFrontmatterBlock(content);
  if (!block) return '';

  const lines = block.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([^:]+):\s*(.*)$/);
    if (!m || m[1].trim() !== key) continue;

    const inlineValue = m[2].trim();

    // Collect indented list items
    const listItems: string[] = [];
    let j = i + 1;
    while (j < lines.length && lines[j].startsWith('  - ')) {
      listItems.push(lines[j].replace(/^\s+-\s*/, '').trim());
      j++;
    }

    if (listItems.length > 0) return listItems.join(', ');
    return inlineValue;
  }
  return '';
}
