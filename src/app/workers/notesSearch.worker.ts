interface SearchableNote {
  id: string;
  title: string;
  tags: string[];
  tagsLower: string[];
  frontmatterText: string;
  searchText: string;
  updatedTime: number;
}

interface IndexRequest {
  type: 'index';
  notes: SearchableNote[];
  indexVersion: string;
}

interface SearchRequest {
  type?: 'search';
  requestId: number;
  indexVersion: string;
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
let indexedNotes: SearchableNote[] = [];
let currentIndexVersion = '';

function cacheKey(request: SearchRequest): string {
  return [
    request.indexVersion,
    request.searchTerm.trim().toLowerCase(),
    [...request.selectedTags].sort().join('\x1f'),
    request.searchMode,
    request.expandedKeywords.map(k => k.toLowerCase()).sort().join('\x1f'),
  ].join('\x1e');
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
  const tags = note.tagsLower;
  const frontmatterText = note.frontmatterText;

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
    if (note.searchText.includes(term)) {
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

self.onmessage = (event: MessageEvent<IndexRequest | SearchRequest>) => {
  if (event.data.type === 'index') {
    indexedNotes = event.data.notes;
    currentIndexVersion = event.data.indexVersion;
    resultCache.clear();
    return;
  }

  const { requestId, searchTerm, selectedTags, searchMode, expandedKeywords } = event.data;
  const indexVersion = event.data.indexVersion || currentIndexVersion;
  if (indexVersion !== currentIndexVersion) {
    self.postMessage({ requestId, results: [] });
    return;
  }

  const key = cacheKey({ ...event.data, indexVersion });
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
  const updatedTimeById = new Map(indexedNotes.map(note => [note.id, note.updatedTime]));
  const results = indexedNotes
    .filter(note =>
      normalizedSelectedTags.every(tag =>
        note.tagsLower.some(noteTag => noteTag === tag)
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
