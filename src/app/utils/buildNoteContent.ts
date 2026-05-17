import { NoteTemplateConfig } from '../types/note';

export function buildNoteContent(template: NoteTemplateConfig): string {
  const { metadataFields, bodyTemplate } = template;

  if (metadataFields.length === 0) {
    return bodyTemplate;
  }

  const yamlLines: string[] = [];
  for (const field of metadataFields) {
    const { key, defaultValue } = field;
    if (key === 'tags' && defaultValue.includes(',')) {
      const tags = defaultValue.split(',').map(t => t.trim()).filter(Boolean);
      yamlLines.push(`${key}:`);
      for (const tag of tags) {
        yamlLines.push(`  - ${tag}`);
      }
    } else if (key === 'tags' && defaultValue.trim()) {
      yamlLines.push(`${key}:`);
      yamlLines.push(`  - ${defaultValue.trim()}`);
    } else {
      yamlLines.push(`${key}: ${defaultValue}`);
    }
  }

  return `---\n${yamlLines.join('\n')}\n---\n\n${bodyTemplate}`;
}
