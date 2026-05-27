// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { normalizeNoteLinkKey, noteLinkAliases, parseFrontmatterLinks, parseMarkdownLinkRecords, parseMarkdownLinks } from '../../app/utils/noteLinks';

describe('note link parsing', () => {
  it('accepts standard markdown note links', () => {
    expect(parseMarkdownLinks('[target note](folder/target%20note.md#heading)')).toEqual([
      'target note',
      'target note.md',
      'folder/target note.md',
      'folder/target note',
    ]);
  });

  it('accepts empty-label markdown note links', () => {
    expect(parseMarkdownLinks('[](target note.md)')).toEqual([
      'target note.md',
      'target note',
    ]);
  });

  it('accepts markdown note links inside task list items', () => {
    expect(parseMarkdownLinks('- [ ] [領域 - 學習的更有效率](領域%20-%20學習的更有效率.md)  #task❓')).toEqual([
      '領域 - 學習的更有效率',
      '領域 - 學習的更有效率.md',
    ]);
  });

  it('marks task markdown links to md files as local notes', () => {
    expect(parseMarkdownLinkRecords('- [ ] [領域 - 學習的更有效率](領域%20-%20學習的更有效率.md)  #task❓')[0]).toMatchObject({
      label: '領域 - 學習的更有效率',
      target: '領域 - 學習的更有效率.md',
      isLocalNote: true,
    });
  });

  it('does not mark external markdown links as local notes', () => {
    expect(parseMarkdownLinkRecords('[Google 地圖](https://maps.app.goo.gl/example)')[0]).toMatchObject({
      label: 'Google 地圖',
      isLocalNote: false,
    });
  });

  it('accepts angle-bracket markdown destinations', () => {
    expect(parseMarkdownLinks('[target](<folder/target note.md>)')).toEqual([
      'target',
      'target.md',
      'folder/target note.md',
      'folder/target note',
      'target note',
    ]);
  });

  it('ignores markdown image links', () => {
    expect(parseMarkdownLinks('![target](target note.md)')).toEqual([]);
  });

  it('parses markdown links inside frontmatter link fields', () => {
    expect(parseFrontmatterLinks('---\nconnect:\n  - [](target note.md)\n---\n')).toEqual([
      'target note.md',
      'target note',
    ]);
  });

  it('normalizes encoded task link targets to the same key as note names', () => {
    expect(normalizeNoteLinkKey('領域%20-%20學習的更有效率.md')).toBe('領域 - 學習的更有效率.md');
    expect(noteLinkAliases('folder/領域 - 學習的更有效率.md')).toContain('領域 - 學習的更有效率');
  });
});
