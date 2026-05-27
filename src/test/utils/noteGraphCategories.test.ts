// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { MAX_AI_CATEGORIES, limitCategoryMap, normalizeCategory, sortCategories } from '../../app/utils/noteGraphCategories';

describe('note graph AI categories', () => {
  it('normalizes empty categories to other', () => {
    expect(normalizeCategory('')).toBe('其他');
    expect(normalizeCategory('  學習  ')).toBe('學習');
  });

  it('limits categories to five by keeping the most common groups', () => {
    const limited = limitCategoryMap({
      a: '學習',
      b: '學習',
      c: '健康',
      d: '健康',
      e: '寫作',
      f: '工作',
      g: '財務',
      h: '旅行',
    });

    expect(new Set(Object.values(limited)).size).toBeLessThanOrEqual(MAX_AI_CATEGORIES);
    expect(Object.values(limited)).toContain('其他');
    expect(limited.a).toBe('學習');
    expect(limited.c).toBe('健康');
  });

  it('sorts other last for stable filter and layout ordering', () => {
    expect(sortCategories(['其他', '健康', '學習'])).toEqual(['健康', '學習', '其他']);
  });
});
