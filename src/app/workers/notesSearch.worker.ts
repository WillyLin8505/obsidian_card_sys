interface SearchableNote {
  id: string;
  title: string;
  tags: string[];
  frontmatter: Record<string, string>;
  content: string;
  searchText: string;
  updatedTime: number;
}

interface SearchRequest {
  requestId: number;
  notes: SearchableNote[];
  searchTerm: string;
  selectedTags: string[];
  searchMode: 'text' | 'semantic';
  expandedKeywords: string[];
}

interface SearchResult {
  id: string;
  score: number;
  reasons: string[];
}

const resultCache = new Map<string, SearchResult[]>();
const MAX_CACHE_SIZE = 50;

function cacheKey(request: Omit<SearchRequest, 'requestId'>): string {
  return JSON.stringify({
    notes: request.notes.map(n => [n.id, n.updatedTime]),
    searchTerm: request.searchTerm.trim().toLowerCase(),
    selectedTags: [...request.selectedTags].sort(),
    searchMode: request.searchMode,
    expandedKeywords: request.expandedKeywords.map(k => k.toLowerCase()).sort(),
  });
}

function remember(key: string, results: SearchResult[]): void {
  if (resultCache.size >= MAX_CACHE_SIZE) {
    const oldest = resultCache.keys().next().value;
    if (oldest) resultCache.delete(oldest);
  }
  resultCache.set(key, results);
}

function noteScore(note: SearchableNote, terms: string[], selectedTags: string[], hasQuery: boolean): SearchResult | null {
  let score = 0;
  const reasons = new Set<string>();
  const title = note.title.toLowerCase();
  const tags = note.tags.map(tag => tag.toLowerCase());
  const frontmatterText = Object.values(note.frontmatter || {}).join(' ').toLowerCase();
  const content = note.content.toLowerCase();

  if (!hasQuery) {
    score += 1;
  }

  for (const term of terms) {
    if (!term) continue;
    if (title.includes(term)) {
      score += title === term ? 120 : 80;
      reasons.add('標題');
    }
    if (tags.some(tag => tag.includes(term))) {
      score += 55;
      reasons.add('標籤');
    }
    if (frontmatterText.includes(term)) {
      score += 35;
      reasons.add('摘要');
    }
    if (content.includes(term) || note.searchText.includes(term)) {
      score += 10;
      reasons.add('內文');
    }
  }

  if (selectedTags.length > 0) {
    score += selectedTags.length * 30;
    reasons.add('篩選標籤');
  }

  if (hasQuery && score === 0) return null;
  return { id: note.id, score, reasons: [...reasons] };
}

self.onmessage = (event: MessageEvent<SearchRequest>) => {
  const { requestId, notes, searchTerm, selectedTags, searchMode, expandedKeywords } = event.data;
  const key = cacheKey({ notes, searchTerm, selectedTags, searchMode, expandedKeywords });
  const cached = resultCache.get(key);
  if (cached) {
    self.postMessage({ requestId, results: cached });
    return;
  }

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const terms = searchMode === 'semantic' && expandedKeywords.length > 0
    ? expandedKeywords.map(kw => kw.trim().toLowerCase()).filter(Boolean)
    : normalizedSearch.split(/\s+/).filter(Boolean);
  const hasQuery = terms.length > 0;

  const normalizedSelectedTags = selectedTags.map(tag => tag.toLowerCase());
  const updatedTimeById = new Map(notes.map(note => [note.id, note.updatedTime]));
  const results = notes
    .filter(note =>
      normalizedSelectedTags.every(tag =>
        note.tags.some(noteTag => noteTag.toLowerCase() === tag)
      )
    )
    .map(note => noteScore(note, terms, selectedTags, hasQuery))
    .filter((result): result is SearchResult => Boolean(result))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (updatedTimeById.get(b.id) || 0) - (updatedTimeById.get(a.id) || 0);
    });

  remember(key, results);
  self.postMessage({ requestId, results });
};

export {};
