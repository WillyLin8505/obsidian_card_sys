import { localApi } from './api';

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

function isExternalUrl(src: string): boolean {
  return /^(https?:|data:|blob:|\/)/i.test(src);
}

function stripAngleBrackets(src: string): string {
  return src.trim().replace(/^<|>$/g, '');
}

function obsidianImageTarget(raw: string): { file: string; alt: string } | null {
  const [filePart, labelPart] = raw.split('|');
  const file = filePart.trim();
  if (!IMAGE_EXT_RE.test(file)) return null;
  return {
    file,
    alt: (labelPart || file.split('/').pop() || file).replace(/^\d+x?\d*$/, file),
  };
}

export function containsMarkdownImage(markdown: string): boolean {
  return /!\[\[[^\]]+\]\]/.test(markdown) || /!\[[^\]]*]\([^)]+\)/.test(markdown);
}

export function preprocessVaultImages(markdown: string, vaultPath?: string, notePath?: string): string {
  if (!vaultPath) return markdown;

  let result = markdown.replace(/!\[\[([^\]]+)]]/g, (match, rawTarget) => {
    const target = obsidianImageTarget(rawTarget);
    if (!target) return match;
    return `![${target.alt}](${localApi.assetUrl(vaultPath, target.file, notePath)})`;
  });

  result = result.replace(/!\[([^\]]*)]\(([^)]+)\)/g, (match, alt, rawSrc) => {
    const src = stripAngleBrackets(rawSrc);
    if (isExternalUrl(src) || !IMAGE_EXT_RE.test(src)) return match;
    return `![${alt}](${localApi.assetUrl(vaultPath, src, notePath)})`;
  });

  return result;
}
