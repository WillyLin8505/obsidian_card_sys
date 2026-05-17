import { lazy, memo, Suspense, useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { api, localApi } from '../utils/api';
import { storage, sortByRecentActivity } from '../utils/storage';
import { Note } from '../types/note';
import { NoteChunk } from '../types/ai-search';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Button } from '../components/ui/button';
import { Search, Loader2, X, Sparkles, Link2, Link2Off, Save, Plus, Maximize2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { toast } from 'sonner';
import { parseFrontmatterValue } from '../utils/frontmatter';
import { buildNoteContent } from '../utils/buildNoteContent';
import { getCardFontSizes, makeMarkdownComponents } from '../utils/noteCardSizes';

const NoteGraph = lazy(() => import('../components/NoteGraph').then(module => ({ default: module.NoteGraph })));
const LazyMarkdown = lazy(() => import('../components/LazyMarkdown').then(module => ({ default: module.LazyMarkdown })));
const GraphNoteEditor = lazy(() => import('../components/GraphNoteEditor').then(module => ({ default: module.GraphNoteEditor })));
const GraphNotePreview = lazy(() => import('../components/GraphNotePreview').then(module => ({ default: module.GraphNotePreview })));

// Module-level notes cache — survives route changes, cleared on page refresh.
// Avoids re-reading the entire vault every time the user switches to this page.
let _notesCache: { notes: Note[]; ts: number } | null = null;
const NOTES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedNotes(): Note[] | null {
  if (!_notesCache) return null;
  if (Date.now() - _notesCache.ts > NOTES_CACHE_TTL) return null;
  return _notesCache.notes;
}
function setCachedNotes(notes: Note[]): void {
  _notesCache = { notes, ts: Date.now() };
}
function invalidateNotesCache(): void {
  _notesCache = null;
}

// Module-level search results cache — keyed by sorted chip IDs + manual query.
// Prevents re-hitting the Python vector search server when the user navigates
// back or clicks the same graph node again.
let _searchCache = new Map<string, Note[] | NoteChunk[]>();
let _generatedNotesCache = new Map<string, GeneratedNote[]>();

function searchCacheKey(chips: NoteChip[], q: string): string {
  return chips.map(c => c.id).sort().join('\x00') + '|' + q.trim();
}
function getSearchCache(chips: NoteChip[], q: string): Note[] | NoteChunk[] | undefined {
  return _searchCache.get(searchCacheKey(chips, q));
}
function setSearchCache(chips: NoteChip[], q: string, results: Note[] | NoteChunk[]): void {
  _searchCache.set(searchCacheKey(chips, q), results);
}
function getGeneratedCache(chips: NoteChip[], models: string[]): GeneratedNote[] | undefined {
  const key = chips.map(c => c.id).sort().join('\x00') + '§' + [...models].sort().join(',');
  return _generatedNotesCache.get(key);
}
function setGeneratedCache(chips: NoteChip[], models: string[], notes: GeneratedNote[]): void {
  const key = chips.map(c => c.id).sort().join('\x00') + '§' + [...models].sort().join(',');
  _generatedNotesCache.set(key, notes);
}
function invalidateResultsCaches(): void {
  _searchCache.clear();
  _generatedNotesCache.clear();
}

function normalizeNoteId(value: string): string {
  let normalized = value.trim();
  try {
    normalized = decodeURIComponent(normalized);
  } catch {}
  normalized = normalized
    .replace(/^qmd:\/\/title-match\//, '')
    .replace(/^qmd:\/\/[^/]+\//, '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  return normalized;
}

function noteIdentityParts(value: string): string[] {
  const normalized = normalizeNoteId(value);
  const withoutMd = normalized.replace(/\.md$/i, '');
  const basename = withoutMd.split('/').pop() || withoutMd;
  return [...new Set([normalized, withoutMd, basename].filter(Boolean))];
}

function makeNoteIdentitySet(ids: string[]): Set<string> {
  return new Set(ids.flatMap(noteIdentityParts));
}

function isSameNoteId(a: string, b: string): boolean {
  const aParts = noteIdentityParts(a);
  const bSet = makeNoteIdentitySet([b]);
  return aParts.some(part => bSet.has(part));
}

function hasConsumedPermanentNotesNav(key: string): boolean {
  if (key === 'default') return false;
  try {
    return sessionStorage.getItem(`pnotes_nav_consumed_${key}`) === '1';
  } catch {
    return false;
  }
}

function markPermanentNotesNavConsumed(key: string): void {
  if (key === 'default') return;
  try {
    sessionStorage.setItem(`pnotes_nav_consumed_${key}`, '1');
  } catch {}
}

const THINKING_MODELS = [
  { id: '第一性原理', label: '第一性原理' },
  { id: '六頂思考帽', label: '六頂思考帽' },
  { id: '5個Why', label: '5個Why' },
  { id: 'SWOT分析', label: 'SWOT分析' },
  { id: '冰山模型', label: '冰山模型' },
  { id: 'AQAL模型', label: 'AQAL 模型' },
  { id: '賽局理論', label: '賽局理論' },
  { id: '矩陣分析法', label: '矩陣分析法' },
  { id: '類比思考', label: '類比思考' },
  { id: '二階思考', label: '二階思考' },
];

interface NoteChip {
  id: string;
  title: string;
  searchContent: string;
}

interface GeneratedNote {
  model: string;
  title: string;
  abstract: string;
  connect: string[];
  content: string;
}

interface QuickFleetNoteCreatorProps {
  templateContent: string;
  onCreate: (title: string, content: string) => Promise<void>;
}

const QuickFleetNoteCreator = memo(function QuickFleetNoteCreator({
  templateContent,
  onCreate,
}: QuickFleetNoteCreatorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState(templateContent);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    setContent(templateContent);
  }, [templateContent]);

  const handleCreate = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error('請先輸入筆記名稱');
      return;
    }

    setIsCreating(true);
    try {
      await onCreate(trimmedTitle, content);
      setTitle('');
      setContent(templateContent);
    } catch {
      // onCreate already shows the concrete error toast; keep draft text intact.
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="mt-2 flex min-h-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white p-2">
      <div className="flex items-center gap-2">
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleCreate();
          }}
          placeholder="輸入閃念筆記名稱..."
          className="h-7 border-none px-1 text-xs shadow-none focus-visible:ring-0"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={handleCreate}
          disabled={isCreating || !title.trim()}
          className="h-7 shrink-0 gap-1 px-2 text-xs"
        >
          {isCreating
            ? <Loader2 className="size-3 animate-spin" />
            : <Plus className="size-3" />}
          建立
        </Button>
      </div>
      <Textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        onWheel={e => e.stopPropagation()}
        placeholder="閃念筆記模板內容"
        className="mt-2 min-h-0 flex-1 resize-none overflow-y-auto font-mono text-xs"
      />
    </div>
  );
});

export function PermanentNotes() {
  const navigate = useNavigate();
  const location = useLocation();
  const shouldUseNavSearchState = (() => {
    const state = location.state as { searchQuery?: string } | null;
    return Boolean(state?.searchQuery) && !hasConsumedPermanentNotesNav(location.key);
  })();
  const [allNotes, setAllNotes] = useState<Note[]>(() => {
    const stateNotes = (location.state as { notes?: Note[] } | null)?.notes;
    if (stateNotes && stateNotes.length > 0) {
      return sortByRecentActivity(stateNotes);
    }
    return getCachedNotes() ?? [];
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const stateNotes = (location.state as { notes?: Note[] } | null)?.notes;
    if (stateNotes && stateNotes.length > 0) return false;
    return getCachedNotes() === null;
  });
  const autoSearchedRef = useRef(false);

  const config = useMemo(() => storage.getConfig(), []);
  const isObsidianMode = config.dataSource === 'obsidian';
  const cardSizes = useMemo(() => getCardFontSizes(config), [config]);
  const mdComponents = useMemo(() => makeMarkdownComponents(cardSizes), [cardSizes]);

  const [noteChips, setNoteChips] = useState<NoteChip[]>(() => {
    const state = location.state as { searchQuery?: string; searchContent?: string; noteId?: string } | null;
    if (shouldUseNavSearchState && state?.searchQuery) {
      return [{
        id: state.noteId || `nav-${Date.now()}`,
        title: state.searchQuery,
        searchContent: state.searchContent || state.searchQuery,
      }];
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem('pnotes_chips') || 'null');
      if (Array.isArray(saved)) return saved;
    } catch {}
    return [];
  });
  const [showGraph, setShowGraph] = useState(false);
  const [isGraphExpanded, setIsGraphExpanded] = useState(false);
  const [graphDepth, setGraphDepth] = useState(1);
  const [graphSelectedNote, setGraphSelectedNote] = useState<Note | null>(null);
  const [graphEditMode, setGraphEditMode] = useState(false);
  const graphEditContentRef = useRef('');
  const [graphSaving, setGraphSaving] = useState(false);
  const [manualQuery, setManualQuery] = useState(() => {
    try { return sessionStorage.getItem('pnotes_query') ?? ''; } catch { return ''; }
  });
  const [searchResults, setSearchResults] = useState<Note[] | NoteChunk[] | null>(() => {
    const state = location.state as { searchQuery?: string; noteId?: string } | null;
    if (shouldUseNavSearchState && state?.searchQuery) {
      // Navigating here from another page with a specific note — check module cache first
      // so we skip the Python search call if we've already done this query.
      const chips: NoteChip[] = [{
        id: state.noteId || `nav-${Date.now()}`,
        title: state.searchQuery,
        searchContent: state.searchQuery,
      }];
      const cached = getSearchCache(chips, '');
      if (cached) return cached;
      return null;
    }
    try {
      const saved = sessionStorage.getItem('pnotes_results');
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });
  const [isSearching, setIsSearching] = useState(false);

  // Persist search state across page navigation
  useEffect(() => {
    try { sessionStorage.setItem('pnotes_chips', JSON.stringify(noteChips)); } catch {}
  }, [noteChips]);

  useEffect(() => {
    if (noteChips.length >= 1) setShowGraph(true);
  }, [noteChips.length]);

  useEffect(() => {
    try { sessionStorage.setItem('pnotes_query', manualQuery); } catch {}
  }, [manualQuery]);

  useEffect(() => {
    try {
      if (searchResults !== null) sessionStorage.setItem('pnotes_results', JSON.stringify(searchResults));
      else sessionStorage.removeItem('pnotes_results');
    } catch {}
  }, [searchResults]);

  const isQmdResult = (r: Note[] | NoteChunk[] | null): r is NoteChunk[] =>
    r !== null && r.length > 0 && 'notePath' in r[0];

  const displayResults = useMemo(() => {
    if (!searchResults || !isQmdResult(searchResults)) return searchResults;
    return searchResults;
  }, [searchResults, noteChips]);

  const [linkedNoteIds, setLinkedNoteIds] = useState<Set<string>>(new Set());
  const [linkingNoteId, setLinkingNoteId] = useState<string | null>(null);

  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedNotes, setGeneratedNotes] = useState<GeneratedNote[] | null>(() => {
    // Restore AI analysis from module-level cache so it survives navigation.
    // selectedModels isn't known yet, so we check all cached entries for the current chips.
    const initChips: NoteChip[] = (() => {
      const state = location.state as { searchQuery?: string; searchContent?: string; noteId?: string } | null;
      if (shouldUseNavSearchState && state?.searchQuery) {
        return [{ id: state.noteId || '', title: state.searchQuery, searchContent: state.searchContent || state.searchQuery }];
      }
      try {
        const saved = JSON.parse(sessionStorage.getItem('pnotes_chips') || 'null');
        if (Array.isArray(saved)) return saved;
      } catch {}
      return [];
    })();
    if (initChips.length === 0) return null;
    const prefix = initChips.map(c => c.id).sort().join('\x00') + '§';
    for (const [k, v] of _generatedNotesCache) {
      if (k.startsWith(prefix)) return v;
    }
    return null;
  });
  const [isEnriching, setIsEnriching] = useState(false);
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set());
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const fleetTemplateContent = useMemo(() => buildNoteContent(config.fleetNoteTemplate), [config]);

  // Reset saved state whenever a new batch of notes is generated
  useEffect(() => { setSavedIndices(new Set()); }, [generatedNotes]);

  // ── 雙向連結 helpers ─────────────────────────────────────────

  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const addLink = (content: string, targetName: string): string => {
    const entry = `[[${targetName}]]`;
    if (content.includes(entry)) return content;
    if (/^# link$/m.test(content)) {
      return content.replace(/^# link$/m, `# link\n\n${entry}`);
    }
    return content.trimEnd() + `\n\n# link\n\n${entry}\n`;
  };

  const removeLink = (content: string, targetName: string): string => {
    const entry = `[[${targetName}]]`;
    let result = content.replace(new RegExp(`\\[\\[${escapeRegex(targetName)}\\]\\]\\n?`, 'g'), '');
    result = result.replace(/^# link\n+(?=\n|$)/m, '');
    result = result.replace(/^# link\s*$/m, '');
    return result;
  };

  const sanitizeFilename = (title: string) =>
    title.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();

  const buildGeneratedFileContent = (note: GeneratedNote): string => {
    const connectYaml = note.connect.length > 0
      ? `connect:\n${note.connect.map(c => `  - ${c}`).join('\n')}\n`
      : '';
    return (
      `---\ntitle: ${note.title}\nabstract: ${note.abstract}\n${connectYaml}` +
      `tags:\n  - AI連結\n  - ${note.model}\n---\n\n${note.content}`
    );
  };

  const handleSaveNote = async (note: GeneratedNote, index: number, withLink: boolean) => {
    const cfg = storage.getConfig();
    if (!cfg.notePath) {
      toast.error('請先在設定中填寫 Vault 路徑');
      return;
    }
    setSavingIndex(index);
    try {
      const filename = sanitizeFilename(note.title);
      const fileContent = buildGeneratedFileContent(note);
      const relativePath = await localApi.createNote(cfg.notePath, filename, fileContent);

      const newNote: Note = {
        id: relativePath,
        title: note.title,
        content: fileContent,
        type: 'permanent',
        tags: ['AI連結', note.model],
        links: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setAllNotes(prev => { const u = [newNote, ...prev]; setCachedNotes(u); return u; });

      if (withLink && noteChips.length > 0) {
        const baseName = filename.replace(/\.md$/, '');
        await Promise.all(noteChips.map(async chip => {
          const chipNote = allNotes.find(n => n.id === chip.id);
          if (!chipNote) return;
          const updated = addLink(chipNote.content, baseName);
          await localApi.updateNote(chip.id, cfg.notePath!, updated);
          setAllNotes(prev => { const u = prev.map(n => n.id === chip.id ? { ...n, content: updated } : n); setCachedNotes(u); return u; });
        }));
        toast.success('筆記已儲存並建立雙向連結');
      } else {
        toast.success('筆記已儲存');
      }
      setSavedIndices(prev => new Set(prev).add(index));
    } catch (err: any) {
      toast.error(`儲存失敗: ${err.message}`);
    } finally {
      setSavingIndex(null);
    }
  };

  // 當 chips 改變時，計算哪些筆記已經跟 chip 筆記連結
  useEffect(() => {
    if (noteChips.length !== 1 || allNotes.length === 0) {
      setLinkedNoteIds(new Set());
      return;
    }
    const chipNote = allNotes.find(n => n.id === noteChips[0].id);
    if (!chipNote) return;
    const chipName = chipNote.id.split('/').pop()?.replace('.md', '') ?? chipNote.title;
    const linked = new Set<string>();
    allNotes.forEach(n => {
      if (n.id !== chipNote.id && n.content.includes(`[[${chipName}]]`)) {
        linked.add(n.id);
      }
    });
    setLinkedNoteIds(linked);
  }, [noteChips, allNotes]);

  const handleToggleLink = async (targetId: string) => {
    if (noteChips.length !== 1) {
      toast.info('請先點擊一則筆記加入搜尋列作為連結來源');
      return;
    }
    const cfg = storage.getConfig();
    if (!cfg.notePath) {
      toast.error('請先在設定中填寫 Vault 路徑');
      return;
    }

    const chipNote = allNotes.find(n => n.id === noteChips[0].id);
    const targetNote = allNotes.find(n => n.id === targetId);
    if (!chipNote || !targetNote) {
      toast.error('找不到筆記內容，請重新載入');
      return;
    }

    const chipName = chipNote.id.split('/').pop()?.replace('.md', '') ?? chipNote.title;
    const targetName = targetNote.id.split('/').pop()?.replace('.md', '') ?? targetNote.title;
    const isLinked = linkedNoteIds.has(targetId);

    setLinkingNoteId(targetId);
    try {
      const newChipContent = isLinked
        ? removeLink(chipNote.content, targetName)
        : addLink(chipNote.content, targetName);
      const newTargetContent = isLinked
        ? removeLink(targetNote.content, chipName)
        : addLink(targetNote.content, chipName);

      await Promise.all([
        localApi.updateNote(chipNote.id, cfg.notePath, newChipContent),
        localApi.updateNote(targetNote.id, cfg.notePath, newTargetContent),
      ]);

      setAllNotes(prev => {
        const updated = prev.map(n => {
          if (n.id === chipNote.id) return { ...n, content: newChipContent };
          if (n.id === targetNote.id) return { ...n, content: newTargetContent };
          return n;
        });
        setCachedNotes(updated);
        return updated;
      });
      setLinkedNoteIds(prev => {
        const s = new Set(prev);
        isLinked ? s.delete(targetId) : s.add(targetId);
        return s;
      });
      invalidateResultsCaches(); // note content changed — search results are stale
      toast.success(isLinked ? '已取消雙向連結' : '已建立雙向連結');
    } catch (err: any) {
      toast.error(`連結失敗: ${err.message}`);
    } finally {
      setLinkingNoteId(null);
    }
  };

  // ─────────────────────────────────────────────────────────────

  const removeFrontmatter = (content: string): string =>
    content.replace(/^---\s*\n[\s\S]*?\n---\s*\n*/, '').trim();

  const extractTags = (note: Note): string[] => {
    const tags = note.tags || [];
    const frontmatterMatch = note.content.match(/tags:\s*\n([\s\S]*?)(?=\n\w+:|---)/);
    if (frontmatterMatch) {
      const fmTags = frontmatterMatch[1]
        .split('\n')
        .map(line => line.trim().replace(/^-\s*/, ''))
        .filter(Boolean);
      return [...new Set([...tags, ...fmTags])];
    }
    return tags;
  };

  const getContentPreview = (content: string, maxLength = 200): string => {
    const cleaned = removeFrontmatter(content);
    return cleaned.length > maxLength ? cleaned.substring(0, maxLength) + '...' : cleaned;
  };

  // Extract title + abstract + connect from YAML frontmatter,
  // falling back to markdown section headings if frontmatter fields are absent.
  const extractSearchContent = (note: Note): string => {
    const parts: string[] = [note.title];

    // ── 1. Parse YAML frontmatter ──────────────────────────────
    const fmMatch = note.content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const fm = fmMatch[1];

      // abstract: single-line string value
      const abstractMatch = fm.match(/^abstract:\s*(.+)$/m);
      if (abstractMatch) parts.push(abstractMatch[1].trim());

      // connect: YAML list  (  - item)
      const connectMatch = fm.match(/^connect:\s*\n((?:\s+-[^\n]*\n?)*)/m);
      if (connectMatch) {
        const items = connectMatch[1]
          .split('\n')
          .map(l => l.trim().replace(/^-\s*/, ''))
          .filter(Boolean);
        if (items.length) parts.push(items.join(' '));
      }
    }

    // ── 2. Fallback: scan markdown body for ## Abstract / ## Connection ──
    if (parts.length === 1) {
      const body = removeFrontmatter(note.content);
      const TARGET = new Set(['abstract', '摘要', 'connection', 'connections', '連結']);
      const lines = body.split('\n');
      let heading: string | null = null;
      let buf: string[] = [];

      const flush = () => {
        if (heading && TARGET.has(heading.toLowerCase())) {
          const text = buf.join(' ').replace(/\s+/g, ' ').trim();
          if (text) parts.push(text);
        }
      };

      for (const line of lines) {
        const m = line.match(/^#{1,6}\s+(.+)$/);
        if (m) { flush(); heading = m[1].trim(); buf = []; }
        else { buf.push(line); }
      }
      flush();
    }

    return parts.join(' ');
  };

  const graphCenterIds = useMemo(() => {
    const noteName = (id: string) => id.split('/').pop()?.replace(/\.md$/i, '') ?? id;
    return noteChips
      .map(chip => {
        const matched = allNotes.find(n =>
          n.id === chip.id ||
          n.title === chip.title ||
          noteName(n.id) === chip.title
        );
        return matched?.id ?? chip.id;
      })
      .filter(Boolean);
  }, [allNotes, noteChips]);

  const expandedCenterNote = useMemo(() => {
    const centerId = graphCenterIds[0];
    if (!centerId) return null;
    return allNotes.find(n => n.id === centerId) ?? null;
  }, [allNotes, graphCenterIds]);

  const setGraphCenterNote = useCallback((id: string) => {
    const note = allNotes.find(n => n.id === id);
    if (!note) return;
    const searchContent = extractSearchContent(note);
    const newChips = [{ id, title: note.title, searchContent }];
    setNoteChips(newChips);
    setGraphSelectedNote(null);
    runSearch(newChips, '');
  }, [allNotes]);

  useEffect(() => {
    const note = graphSelectedNote ?? expandedCenterNote;
    graphEditContentRef.current = note?.content ?? '';
    setGraphEditMode(false);
  }, [graphSelectedNote?.id, expandedCenterNote?.id]);

  useEffect(() => {
    const stateNotes = (location.state as { notes?: Note[] } | null)?.notes;
    if (stateNotes && stateNotes.length > 0) return; // initialized via navigation state
    if (getCachedNotes() !== null) return;            // initialized via in-memory cache
    loadNotes();
  }, []);

  useEffect(() => {
    const state = location.state as { searchQuery?: string; searchContent?: string; noteId?: string; notes?: Note[] } | null;
    if (shouldUseNavSearchState && state?.searchQuery) {
      autoSearchedRef.current = false;
      setSearchResults(null);
      setNoteChips([{
        id: state.noteId || `nav-${Date.now()}`,
        title: state.searchQuery,
        searchContent: state.searchContent || state.searchQuery,
      }]);
      markPermanentNotesNavConsumed(location.key);
    }
  }, [location.key, location.state, shouldUseNavSearchState]);

  useEffect(() => {
    if (!loading && noteChips.length > 0 && searchResults === null && !autoSearchedRef.current) {
      autoSearchedRef.current = true;
      // Enrich chips using actual note data so the search uses the same
      // content (title + abstract + connect) as clicking directly in this page,
      // instead of the tags-based content that AllFiles passes via nav state.
      const enrichedChips = noteChips.map(chip => {
        const note = allNotes.find(n => n.id === chip.id);
        return note ? { ...chip, searchContent: extractSearchContent(note) } : chip;
      });
      runSearch(enrichedChips, '');
    }
  }, [loading, noteChips]);

  const loadNotes = async () => {
    try {
      setLoading(true);
      const notes = await storage.getNotes();
      const sorted = sortByRecentActivity(notes);
      setCachedNotes(sorted);
      setAllNotes(sorted);
    } catch (error: any) {
      console.error('Error loading notes:', error);
      toast.error(`載入失敗: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Search each chip separately in parallel and merge results.
  // Combining all chip content into one long query causes qmd to return nothing.
  const runSearch = async (chips: NoteChip[], manualQ: string) => {
    // Return immediately if we already have results for this exact set of chips + query.
    const cached = getSearchCache(chips, manualQ);
    if (cached) {
      setSearchResults(cached);
      return;
    }

    // If the manual query exactly matches a note title, expand it to full search content
    const trimmed = manualQ.trim();
    const matchedNote = trimmed
      ? allNotes.find(n => n.title.toLowerCase() === trimmed.toLowerCase())
      : null;
    const effectiveManualQ = matchedNote ? extractSearchContent(matchedNote) : trimmed;

    const queries = [
      ...chips.map(c => c.searchContent),
      ...(effectiveManualQ ? [effectiveManualQ] : []),
    ].filter(Boolean);

    if (queries.length === 0) return;
    setIsSearching(true);
    try {
      if (isObsidianMode) {
        const isTemplatePath = (p: string) => {
          const lower = p.toLowerCase();
          return lower.includes('template') || lower.includes('模板');
        };
        const seen = new Set<string>();
        const allChunks: NoteChunk[] = [];
        await Promise.all(queries.map(async (q) => {
          try {
            const result = await localApi.search(q);
            for (const chunk of result.chunks) {
              if (!seen.has(chunk.notePath) && !isTemplatePath(chunk.notePath)) {
                seen.add(chunk.notePath);
                allChunks.push(chunk);
              }
            }
          } catch { /* skip failed sub-query */ }
        }));
        const chipIds = makeNoteIdentitySet(chips.map(c => c.id));
        const sorted = allChunks.sort((a, b) => {
          const aIsSelf = noteIdentityParts(a.notePath).some(part => chipIds.has(part));
          const bIsSelf = noteIdentityParts(b.notePath).some(part => chipIds.has(part));
          if (aIsSelf !== bIsSelf) return aIsSelf ? -1 : 1;
          return b.similarity - a.similarity;
        });

        for (const chip of chips) {
          if (chip.id && !sorted.some(chunk => isSameNoteId(chunk.notePath, chip.id))) {
            const note = allNotes.find(n => isSameNoteId(n.id, chip.id));
            if (note && !isTemplatePath(note.id)) {
              sorted.unshift({
                notePath: `qmd://title-match/${note.id}`,
                content: note.content,
                similarity: 1.0,
              });
            }
          }
        }

        // Boost notes whose title matches the manual query to the front
        const boostQuery = manualQ.trim().toLowerCase();
        if (boostQuery) {
          const titleMatchNotes = allNotes.filter(n =>
            !isTemplatePath(n.id) &&
            n.title.toLowerCase().includes(boostQuery)
          );
          const titleMatchIds = new Set(titleMatchNotes.map(n => n.id));
          const boostedChunks: NoteChunk[] = [];
          const remainingChunks: NoteChunk[] = [];

          for (const chunk of sorted) {
            const matchedTitleId = [...titleMatchIds].find(id => isSameNoteId(id, chunk.notePath));
            if (matchedTitleId) {
              boostedChunks.push(chunk);
              titleMatchIds.delete(matchedTitleId);
            } else {
              remainingChunks.push(chunk);
            }
          }

          // Synthetic entries for title-matched notes not yet indexed by semantic search
          for (const note of titleMatchNotes) {
            if (titleMatchIds.has(note.id)) {
              boostedChunks.push({
                notePath: `qmd://title-match/${note.id}`,
                content: note.content,
                similarity: 1.0,
              });
            }
          }

          const finalResults = [...boostedChunks, ...remainingChunks];
          setSearchCache(chips, manualQ, finalResults);
          setSearchResults(finalResults);
          if (finalResults.length === 0) toast.info('找不到相關筆記');
        } else {
          setSearchCache(chips, manualQ, sorted);
          setSearchResults(sorted);
          if (sorted.length === 0) toast.info('找不到相關筆記');
        }
      } else {
        const chipIds = new Set(chips.map(c => c.id));
        const results = await api.notes.search(queries.join(' '));
        const selfNotes = chips
          .map(chip => allNotes.find(n => n.id === chip.id))
          .filter((n): n is Note => Boolean(n));
        const withSelf = [
          ...selfNotes.filter(n => !results.some((r: Note) => r.id === n.id)),
          ...results,
        ].sort((a: Note, b: Note) => {
          const aIsSelf = chipIds.has(a.id);
          const bIsSelf = chipIds.has(b.id);
          if (aIsSelf !== bIsSelf) return aIsSelf ? -1 : 1;
          return 0;
        });

        // Boost notes whose title matches the manual query to the front
        const boostQuery = manualQ.trim().toLowerCase();
        if (boostQuery) {
          const resultIds = new Set(withSelf.map((n: Note) => n.id));
          const titleMatches = allNotes.filter(n =>
            !resultIds.has(n.id) &&
            n.title.toLowerCase().includes(boostQuery)
          );
          const boosted = [...withSelf.filter(n => chipIds.has(n.id)), ...titleMatches, ...withSelf.filter(n => !chipIds.has(n.id))];
          setSearchCache(chips, manualQ, boosted);
          setSearchResults(boosted);
          if (boosted.length === 0) toast.info('找不到相關筆記');
        } else {
          setSearchCache(chips, manualQ, withSelf);
          setSearchResults(withSelf);
          if (withSelf.length === 0) toast.info('找不到相關筆記');
        }
      }
    } catch (err: any) {
      toast.error(`搜尋失敗: ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = () => {
    if (noteChips.length === 0 && !manualQuery.trim()) return;

    // If the typed text exactly matches a note title, auto-convert it to a chip
    // so the searched note can be shown first, followed by related notes.
    const trimmed = manualQuery.trim();
    if (trimmed) {
      const matchedNote = allNotes.find(
        n => n.title.toLowerCase() === trimmed.toLowerCase()
      );
      if (matchedNote && !noteChips.some(c => c.id === matchedNote.id)) {
        const chip = {
          id: matchedNote.id,
          title: matchedNote.title,
          searchContent: extractSearchContent(matchedNote),
        };
        const newChips = [...noteChips, chip];
        setNoteChips(newChips);
        setManualQuery('');
        runSearch(newChips, '');
        return;
      }
    }

    runSearch(noteChips, manualQuery);
  };

  const removeChip = (chipId: string) => {
    setNoteChips(prev => prev.filter(c => c.id !== chipId));
  };

  const clearSearch = () => {
    setNoteChips([]);
    setManualQuery('');
    setSearchResults(null);
    autoSearchedRef.current = false;
    try {
      sessionStorage.removeItem('pnotes_chips');
      sessionStorage.removeItem('pnotes_query');
      sessionStorage.removeItem('pnotes_results');
      Object.keys(sessionStorage)
        .filter(key => key.startsWith('pnotes_nav_consumed_'))
        .forEach(key => sessionStorage.removeItem(key));
    } catch {}
  };

  const handleNoteClick = (note: Note, event: React.MouseEvent) => {
    storage.recordOpened(note.id);
    if (event.ctrlKey || event.metaKey) {
      // Ctrl+click: open note in edit mode
      event.preventDefault();
      event.stopPropagation();
      const isObsidianNote = note.id.includes('/') || note.id.endsWith('.md');
      if (isObsidianNote) {
        navigate(`/obsidian-note/${encodeURIComponent(note.id)}`, { state: { note } });
      } else if (note.type === 'fleet') {
        navigate(`/fleet-notes/${encodeURIComponent(note.id)}`);
      } else if (note.type === 'source') {
        navigate(`/source-notes/${encodeURIComponent(note.id)}?mode=edit`);
      } else {
        navigate(`/permanent-notes/${encodeURIComponent(note.id)}`);
      }
      return;
    }
    // Normal click: add note as a search chip and search by title + abstract + connection
    const searchContent = extractSearchContent(note);

    if (noteChips.some(c => c.id === note.id)) {
      toast.info(`「${note.title}」已在搜尋列中`);
      return;
    }

    const newChips = [...noteChips, { id: note.id, title: note.title, searchContent }];
    setNoteChips(newChips);
    runSearch(newChips, manualQuery);
  };

  const toggleModel = (modelId: string) => {
    setSelectedModels(prev =>
      prev.includes(modelId) ? prev.filter(m => m !== modelId) : [...prev, modelId]
    );
  };

  const handleGenerateLinkedNotes = async () => {
    if (selectedModels.length === 0) {
      toast.error('請先勾選至少一個思考模型');
      return;
    }
    if (noteChips.length === 0) {
      toast.error('請先點擊筆記加入搜尋列');
      return;
    }
    // Return cached result if the same chips + models were already generated.
    const cachedGen = getGeneratedCache(noteChips, selectedModels);
    if (cachedGen) {
      setGeneratedNotes(cachedGen);
      return;
    }
    setIsGenerating(true);
    setGeneratedNotes(null);
    try {
      const chipNotes = allNotes.filter(n => noteChips.some(c => c.id === n.id || c.title === n.title));
      const notes = chipNotes.map(n => ({ title: n.title, content: n.content }));
      const results = await localApi.generateLinkedNotes(notes, selectedModels);
      setGeneratedCache(noteChips, selectedModels, results);
      setGeneratedNotes(results);
      toast.success(`已生成 ${results.length} 篇連結筆記`);
    } catch (err: any) {
      toast.error(`AI 連結失敗: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEnrichNote = async () => {
    if (noteChips.length === 0) {
      toast.error('請先點擊筆記加入搜尋列');
      return;
    }
    if (!config.notePath) {
      toast.error('請先在設定中填寫 Vault 路徑');
      return;
    }
    setIsEnriching(true);
    try {
      await localApi.enrichNote(noteChips[0].id, config.notePath);
      invalidateResultsCaches();
      // Also kick off vault-wide enrichment for all other unenriched notes in the background.
      // enrich_notes.py --vault skips notes that already have abstract+connect filled in,
      // so only newly added notes (since the last enrich run) will be processed.
      localApi.enrichVault(config.notePath).catch(err => {
        console.warn('[enrich-vault] background batch failed:', err.message);
      });
      toast.success(`「${noteChips[0].title}」AI 填充完成，其餘新筆記正在背景批量填充中...`);
    } catch (err: any) {
      toast.error(`填充失敗: ${err.message}`);
    } finally {
      setIsEnriching(false);
    }
  };

  const handleGraphSave = async () => {
    const note = graphSelectedNote ?? expandedCenterNote;
    if (!note) return;
    setGraphSaving(true);
    try {
      const now = new Date().toISOString();
      const content = graphEditContentRef.current;
      await storage.updateNote(note.id, { content, updatedAt: now });
      const updated = { ...note, content, updatedAt: now };
      if (graphSelectedNote) setGraphSelectedNote(updated);
      setAllNotes(prev => prev.map(n => n.id === note.id ? updated : n));
      invalidateNotesCache();
      toast.success('已儲存');
    } catch (e) {
      toast.error('儲存失敗');
    } finally {
      setGraphSaving(false);
    }
  };

  const handleCreateFleetNote = useCallback(async (title: string, content: string) => {
    const now = new Date().toISOString();

    try {
      if (isObsidianMode) {
        if (!config.notePath) {
          throw new Error('請先在設定中填寫 Vault 路徑');
        }

        const filename = sanitizeFilename(title);
        const relativePath = await localApi.createNote(config.notePath, filename, content);
        const newNote: Note = {
          id: relativePath,
          title,
          content,
          type: 'fleet',
          tags: config.fleetNoteTags || [],
          links: [],
          createdAt: now,
          updatedAt: now,
        };

        setAllNotes(prev => {
          const updated = sortByRecentActivity([newNote, ...prev]);
          setCachedNotes(updated);
          return updated;
        });
        toast.success('閃念筆記已建立');
        navigate(`/obsidian-note/${encodeURIComponent(relativePath)}`, { state: { note: newNote } });
        return;
      }

      const createdNote = await storage.addNote({
        id: `fleet-${Date.now()}`,
        title,
        content,
        type: 'fleet',
        tags: config.fleetNoteTags || [],
        links: [],
        createdAt: now,
        updatedAt: now,
      });
      toast.success('閃念筆記已建立');
      navigate(`/fleet-notes/${encodeURIComponent(createdNote.id)}`);
    } catch (err: any) {
      toast.error(`建立失敗: ${err.message}`);
      throw err;
    }
  }, [config, isObsidianMode, navigate]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12 text-gray-500">載入中...</div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold mb-0.5">連結筆記</h1>
        <p className="text-gray-500 text-xs">共 {allNotes.length} 則筆記</p>
      </div>

      {/* Top area: left = search/AI, right = graph */}
      <div className="flex gap-4 mb-4 items-stretch">

        {/* Left column — half the row */}
        <div className="flex h-[600px] flex-1 min-w-0 flex-col">
          {/* Search — chip input */}
          <div className="flex gap-2 mb-2">
            <div
              className="flex-1 flex flex-wrap items-center gap-1.5 border border-input rounded-md px-3 py-1.5 min-h-[36px] bg-white focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0 cursor-text"
              onClick={() => {
                const input = document.getElementById('perm-search-input');
                if (input) (input as HTMLInputElement).focus();
              }}
            >
              <Search className="size-3.5 text-gray-400 flex-shrink-0" />
              {noteChips.map(chip => (
                <span
                  key={chip.id}
                  className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full max-w-[200px]"
                >
                  <span className="truncate">{chip.title}</span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); removeChip(chip.id); }}
                    className="flex-shrink-0 hover:text-blue-600 ml-0.5"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                id="perm-search-input"
                className="flex-1 min-w-[120px] outline-none text-sm bg-transparent py-0.5"
                placeholder={noteChips.length === 0 ? '點擊筆記加入，或輸入關鍵字...' : '繼續加入...'}
                value={manualQuery}
                onChange={e => setManualQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button
              size="sm"
              onClick={handleSearch}
              disabled={(noteChips.length === 0 && !manualQuery.trim()) || isSearching}
            >
              {isSearching ? <Loader2 className="size-3.5 animate-spin" /> : '搜尋'}
            </Button>
            {(searchResults !== null || noteChips.length > 0 || manualQuery.trim()) && (
              <Button size="sm" variant="outline" onClick={clearSearch}>
                <X className="size-3.5" />
              </Button>
            )}
          </div>

          {/* Thinking Models + AI Button — compact */}
          <div className="p-2 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-600 shrink-0">AI 連結</span>
              {THINKING_MODELS.map(model => (
                <label
                  key={model.id}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer border transition-colors ${
                    selectedModels.includes(model.id)
                      ? 'bg-purple-100 border-purple-400 text-purple-800'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedModels.includes(model.id)}
                    onChange={() => toggleModel(model.id)}
                    className="accent-purple-600 size-3"
                  />
                  {model.label}
                </label>
              ))}
              <Button
                size="sm"
                onClick={handleGenerateLinkedNotes}
                disabled={isGenerating}
                className="ml-auto flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 h-7 text-xs px-2"
              >
                {isGenerating
                  ? <><Loader2 className="size-3 animate-spin" />生成中...</>
                  : <><Sparkles className="size-3" />生成</>
                }
              </Button>
            </div>
          </div>

          {/* AI 填充連結按鈕 */}
          {isObsidianMode && noteChips.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleEnrichNote}
              disabled={isEnriching}
              className="mt-2 flex items-center gap-1.5 text-xs w-full"
            >
              <Sparkles className="size-3" />
              {isEnriching ? 'AI 填充中...' : `AI 填充連結（${noteChips[0].title}）`}
            </Button>
          )}

          <QuickFleetNoteCreator
            templateContent={fleetTemplateContent}
            onCreate={handleCreateFleetNote}
          />
        </div>

        {/* Right column — graph, ~half the row, flush to right edge */}
        <div
          className="flex-shrink-0 overflow-hidden flex"
          style={{
            width: noteChips.length >= 1 ? 900 : 0,
            opacity: noteChips.length >= 1 ? 1 : 0,
            transition: 'width 280ms ease, opacity 220ms ease',
          }}
        >
          <div className="rounded-xl border border-gray-200 bg-slate-50 shadow-sm overflow-hidden flex flex-col" style={{ width: 900, height: 600 }}>
            <div className="px-3 py-1.5 border-b border-gray-200 flex items-center justify-between shrink-0">
              <span className="text-xs font-medium text-gray-500 shrink-0">連結圖譜</span>
              <div className="min-w-0 flex items-center gap-2">
                <span className="text-xs text-indigo-500 truncate max-w-[280px] text-right">
                  {noteChips.map(c => c.title).join(' · ')}
                </span>
                {noteChips.length >= 1 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7 shrink-0"
                        onClick={() => {
                          setShowGraph(true);
                          setIsGraphExpanded(true);
                        }}
                      >
                        <Maximize2 className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>展開圖譜</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            <div className="flex-1 min-h-0">
              {noteChips.length >= 1 && showGraph ? (
                <Suspense fallback={<div className="h-full flex items-center justify-center text-sm text-gray-500">載入圖譜中...</div>}>
                    <NoteGraph
                    allNotes={allNotes}
                    centerNoteIds={graphCenterIds}
                    depth={graphDepth}
                    onDepthChange={setGraphDepth}
                    onNodeCtrlClick={setGraphCenterNote}
                  />
                </Suspense>
              ) : noteChips.length >= 1 ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
                  <p className="text-sm text-gray-500">圖譜會分析目前筆記庫，按下後才開始計算。</p>
                  <Button size="sm" variant="outline" onClick={() => setShowGraph(true)}>
                    顯示連結圖譜
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {isGraphExpanded && noteChips.length >= 1 && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-50">
          <div className="h-11 shrink-0 border-b border-gray-200 bg-white px-4 flex items-center justify-between">
            <div className="min-w-0 flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700 shrink-0">連結圖譜</span>
              <span className="text-xs text-indigo-500 truncate">
                {noteChips.map(c => c.title).join(' · ')}
              </span>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              onClick={() => { setIsGraphExpanded(false); setGraphSelectedNote(null); }}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0">
              <Suspense fallback={<div className="h-full flex items-center justify-center text-sm text-gray-500">載入圖譜中...</div>}>
                <NoteGraph
                  allNotes={allNotes}
                  centerNoteIds={graphCenterIds}
                  depth={graphDepth}
                  onDepthChange={setGraphDepth}
                  onNodeClick={(id) => {
                    const note = allNotes.find(n => n.id === id);
                    if (note) setGraphSelectedNote(note);
                  }}
                  onNodeCtrlClick={setGraphCenterNote}
                />
              </Suspense>
            </div>
            <aside className="w-[420px] max-w-[34vw] min-w-[320px] shrink-0 border-l border-gray-200 bg-white flex flex-col">
              <div className="shrink-0 border-b border-gray-200 px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">
                    {graphSelectedNote ? '點擊的筆記' : '中心筆記'}
                  </span>
                  {(graphSelectedNote ?? expandedCenterNote) && graphEditMode ? (
                    <Button
                      size="sm"
                      variant="default"
                      disabled={graphSaving}
                      onClick={handleGraphSave}
                      className="h-6 text-xs px-2"
                    >
                      {graphSaving ? <Loader2 className="size-3 animate-spin mr-1" /> : <Save className="size-3 mr-1" />}
                      儲存
                    </Button>
                  ) : (graphSelectedNote ?? expandedCenterNote) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setGraphEditMode(true)}
                      className="h-6 text-xs px-2"
                    >
                      編輯
                    </Button>
                  ) : null}
                </div>
                <h2 className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">
                  {(graphSelectedNote ?? expandedCenterNote)?.title ?? noteChips[0]?.title}
                </h2>
              </div>
              {(graphSelectedNote ?? expandedCenterNote) ? (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {graphEditMode ? (
                    <Suspense fallback={<div className="p-4 text-sm text-gray-400">載入編輯器...</div>}>
                      <GraphNoteEditor
                        noteId={(graphSelectedNote ?? expandedCenterNote)!.id}
                        initialContent={(graphSelectedNote ?? expandedCenterNote)!.content}
                        contentRef={graphEditContentRef}
                        vaultPath={config.notePath}
                      />
                    </Suspense>
                  ) : (
                    <Suspense fallback={<div className="p-4 text-sm text-gray-400">載入預覽...</div>}>
                      <GraphNotePreview
                        noteId={(graphSelectedNote ?? expandedCenterNote)!.id}
                        content={(graphSelectedNote ?? expandedCenterNote)!.content}
                        vaultPath={config.notePath}
                      />
                    </Suspense>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                  點擊圖譜節點以查看筆記內容
                </div>
              )}
            </aside>
          </div>
        </div>
      )}

      {/* Generated Notes Panel */}
      {generatedNotes && generatedNotes.length > 0 && (
        <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-purple-800">AI 分析結果</h2>
            <Button variant="ghost" size="sm" onClick={() => setGeneratedNotes(null)}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="flex flex-col gap-4">
            {generatedNotes.map((note, i) => (
              <div key={i} className="bg-white rounded-lg border border-purple-200 p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                    {note.model}
                  </span>
                  <h3 className="font-semibold text-sm leading-snug">{note.title}</h3>
                </div>
                <div className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none">
                  <Suspense fallback={<p className="text-sm text-gray-500">載入內容中...</p>}>
                    <LazyMarkdown content={note.content} components={mdComponents} />
                  </Suspense>
                </div>
                {note.connect && note.connect.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-2 border-t border-purple-100">
                    {note.connect.map((c, ci) => (
                      <span key={ci} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full truncate max-w-[200px]">
                        ↗ {c}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-2 border-t border-purple-100">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingIndex === i || savedIndices.has(i)}
                    onClick={() => handleSaveNote(note, i, false)}
                    className="text-xs h-7 px-2"
                  >
                    {savingIndex === i
                      ? <Loader2 className="size-3 animate-spin mr-1" />
                      : <Save className="size-3 mr-1" />}
                    {savedIndices.has(i) ? '已儲存' : '儲存'}
                  </Button>
                  {noteChips.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingIndex === i || savedIndices.has(i)}
                      onClick={() => handleSaveNote(note, i, true)}
                      className="text-xs h-7 px-2 text-blue-600 border-blue-300 hover:bg-blue-50"
                    >
                      {savingIndex === i
                        ? <Loader2 className="size-4 animate-spin mr-1" />
                        : <Link2 className="size-4 mr-1" />}
                      儲存並連結
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Results */}
      {(searchResults !== null || isSearching) && (
        <div className="mb-8">
          <h2 className="text-base font-semibold mb-3 text-gray-700 flex items-center gap-2">
            {displayResults !== null ? `相關筆記（${displayResults.length} 則）` : '相關筆記'}
            {isSearching && <Loader2 className="size-3.5 animate-spin text-blue-400" />}
          </h2>
          {displayResults !== null && displayResults.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {isQmdResult(displayResults) ? (
                displayResults.map((chunk, i) => {
                  const fileName = chunk.notePath.split('/').pop()?.replace('.md', '') || chunk.notePath;
                  const noteId = normalizeNoteId(chunk.notePath);
                  const fullNote = allNotes.find(n => isSameNoteId(n.id, noteId));
                  const noteTags = fullNote ? extractTags(fullNote) : [];
                  const preview = fullNote
                    ? getContentPreview(fullNote.content)
                    : chunk.content.replace(/^@@[^@]*@@[^\n]*\n?/, '').trim();

                  const handleChunkClick = (event: React.MouseEvent) => {
                    if (event.ctrlKey || event.metaKey) {
                      event.preventDefault();
                      navigate(`/obsidian-note/${encodeURIComponent(noteId)}`, { state: { note: fullNote ?? null } });
                      return;
                    }
                    if (noteChips.some(c => c.id === noteId)) {
                      toast.info(`「${fileName}」已在搜尋列中`);
                      return;
                    }
                    const searchContent = fullNote ? extractSearchContent(fullNote) : fileName;
                    const newChips = [...noteChips, { id: noteId, title: fileName, searchContent }];
                    setNoteChips(newChips);
                    runSearch(newChips, manualQuery);
                  };

                  return (
                    <Tooltip key={i}>
                      <TooltipTrigger asChild>
                        <Card
                          className="p-4 cursor-pointer hover:shadow-lg transition-all bg-white h-64 flex flex-col overflow-hidden relative"
                          onClick={handleChunkClick}
                        >
                          <div className="flex items-start justify-between mb-2 shrink-0">
                            <h3 className="font-bold line-clamp-1 flex-1" style={{ fontSize: `${cardSizes.title}px` }}>{fileName}</h3>
                            <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 ml-2 flex-shrink-0">
                              {(chunk.similarity * 100).toFixed(0)}%
                            </span>
                          </div>
                          {fullNote && config.displayMetadataKeys.includes('tags') && noteTags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2 shrink-0 overflow-hidden max-h-[52px]">
                              {noteTags.map(tag => (
                                <Badge key={tag} variant="secondary" className="max-w-full truncate" style={{ fontSize: `${cardSizes.metadata}px` }}>#{tag}</Badge>
                              ))}
                            </div>
                          )}
                          {fullNote && config.displayMetadataKeys.filter(k => k !== 'tags').map(key => {
                            const val = parseFrontmatterValue(fullNote.content, key);
                            if (!val) return null;
                            return (
                              <p key={key} className="text-gray-400 font-mono break-words shrink-0 truncate" style={{ fontSize: `${cardSizes.metadata}px` }}>
                                <span className="text-gray-500">{key}:</span> {val}
                              </p>
                            );
                          })}
                          <div className="text-gray-600 overflow-hidden flex-1 min-h-0">
                            <p className="line-clamp-6 leading-normal whitespace-pre-line break-words" style={{ fontSize: `${cardSizes.body}px` }}>{preview}</p>
                          </div>
                          {noteChips.length === 1 && noteChips[0].id !== noteId && (
                            <button
                              className={`absolute bottom-2 right-2 p-1.5 rounded-full transition-colors ${
                                linkedNoteIds.has(noteId)
                                  ? 'bg-green-100 text-green-600 hover:bg-red-100 hover:text-red-500'
                                  : 'bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-600'
                              }`}
                              onClick={e => { e.stopPropagation(); handleToggleLink(noteId); }}
                              title={linkedNoteIds.has(noteId) ? '取消雙向連結' : '建立雙向連結'}
                            >
                              {linkingNoteId === noteId
                                ? <Loader2 className="size-5 animate-spin" />
                                : linkedNoteIds.has(noteId)
                                  ? <Link2Off className="size-5" />
                                  : <Link2 className="size-5" />
                              }
                            </button>
                          )}
                        </Card>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>點擊加入搜尋列・Ctrl+Click 開啟編輯</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })
              ) : (
                (displayResults as Note[]).map(note => {
                  const noteTags = extractTags(note);
                  const preview = getContentPreview(note.content);
                  return (
                    <Tooltip key={note.id}>
                      <TooltipTrigger asChild>
                        <Card
                          className="p-4 cursor-pointer hover:shadow-lg transition-all bg-blue-50 border-blue-200 h-64 flex flex-col overflow-hidden"
                          onClick={e => handleNoteClick(note, e)}
                        >
                          <h3 className="font-bold mb-2 line-clamp-1 shrink-0" style={{ fontSize: `${cardSizes.title}px` }}>{note.title}</h3>
                          {config.displayMetadataKeys.includes('tags') && noteTags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2 shrink-0 overflow-hidden max-h-[52px]">
                              {noteTags.map(tag => (
                                <Badge key={tag} variant="secondary" className="max-w-full truncate" style={{ fontSize: `${cardSizes.metadata}px` }}>#{tag}</Badge>
                              ))}
                            </div>
                          )}
                          {config.displayMetadataKeys.filter(k => k !== 'tags').map(key => {
                            const val = parseFrontmatterValue(note.content, key);
                            if (!val) return null;
                            return (
                              <p key={key} className="text-gray-400 font-mono break-words shrink-0 truncate" style={{ fontSize: `${cardSizes.metadata}px` }}>
                                <span className="text-gray-500">{key}:</span> {val}
                              </p>
                            );
                          })}
                          <div className="text-gray-600 overflow-hidden flex-1 min-h-0">
                            <p className="line-clamp-6 leading-normal whitespace-pre-line break-words" style={{ fontSize: `${cardSizes.body}px` }}>{preview}</p>
                          </div>
                        </Card>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>點擊加入搜尋列・Ctrl+Click 開啟編輯</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })
              )}
            </div>
          ) : (
            !isSearching && <p className="text-gray-500 text-sm">沒有找到相關筆記</p>
          )}
          <hr className="mt-6 border-gray-300" />
        </div>
      )}

      {/* Notes Grid */}
      {allNotes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {allNotes.map(note => {
            const isInSearch = noteChips.some(c => c.id === note.id || c.title === note.title);
            const noteTags = extractTags(note);
            const preview = getContentPreview(note.content);

            return (
              <div key={note.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                <Card
                  className={`p-4 cursor-pointer hover:shadow-lg transition-all h-64 flex flex-col overflow-hidden relative ${
                    isInSearch ? 'ring-2 ring-blue-400 bg-blue-50' : 'bg-white'
                  }`}
                  onClick={(event) => handleNoteClick(note, event)}
                >
                  <h3 className="font-bold mb-2 line-clamp-1 shrink-0" style={{ fontSize: `${cardSizes.title}px` }}>{note.title}</h3>
                  {config.displayMetadataKeys.includes('tags') && noteTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2 shrink-0 overflow-hidden max-h-[52px]">
                      {noteTags.map(tag => (
                        <Badge key={tag} variant="secondary" className="max-w-full truncate" style={{ fontSize: `${cardSizes.metadata}px` }}>#{tag}</Badge>
                      ))}
                    </div>
                  )}
                  {config.displayMetadataKeys.filter(k => k !== 'tags').map(key => {
                    const val = parseFrontmatterValue(note.content, key);
                    if (!val) return null;
                    return (
                      <p key={key} className="text-gray-400 font-mono break-words shrink-0 truncate" style={{ fontSize: `${cardSizes.metadata}px` }}>
                        <span className="text-gray-500">{key}:</span> {val}
                      </p>
                    );
                  })}
                  <div className="text-gray-600 overflow-hidden flex-1 min-h-0">
                    <p className="line-clamp-6 leading-normal whitespace-pre-line break-words" style={{ fontSize: `${cardSizes.body}px` }}>{preview}</p>
                  </div>
                  {noteChips.length === 1 && noteChips[0].id !== note.id && (
                    <button
                      className={`absolute bottom-2 right-2 p-1.5 rounded-full transition-colors ${
                        linkedNoteIds.has(note.id)
                          ? 'bg-green-100 text-green-600 hover:bg-red-100 hover:text-red-500'
                          : 'bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-600'
                      }`}
                      onClick={e => { e.stopPropagation(); handleToggleLink(note.id); }}
                      title={linkedNoteIds.has(note.id) ? '取消雙向連結' : '建立雙向連結'}
                    >
                      {linkingNoteId === note.id
                        ? <Loader2 className="size-5 animate-spin" />
                        : linkedNoteIds.has(note.id)
                          ? <Link2Off className="size-5" />
                          : <Link2 className="size-5" />
                      }
                    </button>
                  )}
                </Card>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>點擊加入搜尋列・Ctrl+Click 開啟編輯</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <p>尚無筆記</p>
        </div>
      )}

    </div>
  );
}
