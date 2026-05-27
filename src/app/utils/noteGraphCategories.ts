export const MAX_AI_CATEGORIES = 5;

export function categoryColor(index: number): string {
  const hue = Math.round((index * 137.508) % 360);
  return `hsl(${hue}, 72%, 43%)`;
}

export function normalizeCategory(value: unknown): string {
  const category = String(value || '').trim();
  return category || '其他';
}

export function sortCategories(categories: string[]): string[] {
  return [...new Set(categories.map(normalizeCategory))]
    .sort((a, b) => (a === '其他' ? 1 : 0) - (b === '其他' ? 1 : 0) || a.localeCompare(b, 'zh-Hant'));
}

export function limitCategoryMap(raw: Record<string, string>): Record<string, string> {
  const normalizedEntries = Object.entries(raw).map(([id, value]) => [id, normalizeCategory(value)] as const);
  const distinctCategories = [...new Set(normalizedEntries.map(([, category]) => category))];

  if (distinctCategories.length <= MAX_AI_CATEGORIES) {
    return Object.fromEntries(normalizedEntries);
  }

  const counts = new Map<string, number>();
  normalizedEntries.forEach(([, category]) => {
    if (category !== '其他') counts.set(category, (counts.get(category) ?? 0) + 1);
  });

  const kept = new Set(
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'))
      .slice(0, MAX_AI_CATEGORIES - 1)
      .map(([category]) => category),
  );

  return Object.fromEntries(
    normalizedEntries.map(([id, category]) => [id, category === '其他' || kept.has(category) ? category : '其他']),
  );
}
