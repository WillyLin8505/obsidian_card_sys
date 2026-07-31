import { lazy, memo, Suspense, useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { api, localApi } from '../utils/api';
import { storage, sortByRecentActivity } from '../utils/storage';
import { CardFontSizes, Note } from '../types/note';
import { NoteChunk } from '../types/ai-search';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Button } from '../components/ui/button';
import { Search, Loader2, X, Sparkles, Link2, Link2Off, Save, Plus, Maximize2, ArrowLeft, Undo2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { toast } from 'sonner';
import { parseFrontmatterValue } from '../utils/frontmatter';
import { buildNoteContent } from '../utils/buildNoteContent';
import { getCardFontSizes, makeMarkdownComponents } from '../utils/noteCardSizes';
import { useIsMobile } from '../components/ui/use-mobile';

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
const PNOTES_RESULTS_VERSION = '2';

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

interface GraphConnectionUndo {
  sourceId: string;
  targetId: string;
  sourceTitle: string;
  targetTitle: string;
  sourceName: string;
  targetName: string;
  removeSourceLink: boolean;
  removeTargetLink: boolean;
}

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

const delay = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

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
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white p-2">
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
        className="mt-2 min-h-0 flex-1 resize-none overflow-y-auto font-mono text-xs [field-sizing:fixed]"
      />
    </div>
  );
});

interface PermanentNotesGridProps {
  notes: Note[];
  noteChipLookup: Set<string>;
  noteChipsLength: number;
  activeChipId?: string;
  showTags: boolean;
  nonTagMetadataKeys: string[];
  cardSizes: CardFontSizes;
  linkedNoteIds: Set<string>;
  linkingNoteId: string | null;
  onNoteClick: (note: Note, event: React.MouseEvent) => void;
  onToggleLink: (noteId: string) => void;
}

const PermanentNotesGrid = memo(function PermanentNotesGrid({
  notes,
  noteChipLookup,
  noteChipsLength,
  activeChipId,
  showTags,
  nonTagMetadataKeys,
  cardSizes,
  linkedNoteIds,
  linkingNoteId,
  onNoteClick,
  onToggleLink,
}: PermanentNotesGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {notes.map(note => {
        const isInSearch = noteChipLookup.has(note.id) || noteChipLookup.has(note.title);
        const noteTags = extractTags(note);
        const preview = getContentPreview(note.content);

        return (
          <div key={note.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Card
                  className={`p-4 cursor-pointer hover:shadow-lg transition-all h-64 flex flex-col overflow-hidden relative ${
                    isInSearch ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-white'
                  }`}
                  style={{ contentVisibility: 'auto', containIntrinsicSize: '256px' }}
                  onClick={(event) => onNoteClick(note, event)}
                >
                  <h3 className="font-bold mb-2 shrink-0 max-h-[3em] overflow-hidden" style={{ fontSize: `${cardSizes.title}px` }}>{note.title}</h3>
                  {showTags && noteTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2 shrink-0 overflow-hidden max-h-[52px]">
                      {noteTags.map(tag => (
                        <Badge key={tag} variant="secondary" className="max-w-full truncate" style={{ fontSize: `${cardSizes.metadata}px` }}>#{tag}</Badge>
                      ))}
                    </div>
                  )}
                  {nonTagMetadataKeys.map(key => {
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
                  {noteChipsLength === 1 && activeChipId !== note.id && (
                    <button
                      className={`absolute bottom-2 right-2 p-1.5 rounded-full transition-colors ${
                        linkedNoteIds.has(note.id)
                          ? 'bg-green-100 text-green-600 hover:bg-red-100 hover:text-red-500'
                          : 'bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-600'
                      }`}
                      onClick={e => { e.stopPropagation(); onToggleLink(note.id); }}
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
  );
});

export function PermanentNotes() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
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
  const [graphHistory, setGraphHistory] = useState<NoteChip[][]>([]);
  const [graphSelectedNote, setGraphSelectedNote] = useState<Note | null>(null);
  const [graphSelectedMissingTitle, setGraphSelectedMissingTitle] = useState('');
  const [mobileGraphPanelOpen, setMobileGraphPanelOpen] = useState(false);
  const [graphEditMode, setGraphEditMode] = useState(false);
  const graphEditContentRef = useRef('');
  const [graphSaving, setGraphSaving] = useState(false);
  const [lastGraphConnection, setLastGraphConnection] = useState<GraphConnectionUndo | null>(null);
  const [graphUndoingConnection, setGraphUndoingConnection] = useState(false);
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
      const version = sessionStorage.getItem('pnotes_results_version');
      if (saved && version === PNOTES_RESULTS_VERSION) return JSON.parse(saved);
      if (saved) sessionStorage.removeItem('pnotes_results');
    } catch {}
    return null;
  });
  const [isSearching, setIsSearching] = useState(false);
  const noteChipLookup = useMemo(() => {
    const lookup = new Set<string>();
    noteChips.forEach(chip => {
      lookup.add(chip.id);
      lookup.add(chip.title);
    });
    return lookup;
  }, [noteChips]);
  const metadataKeys = config.displayMetadataKeys;
  const showTags = metadataKeys.includes('tags');
  const nonTagMetadataKeys = useMemo(
    () => metadataKeys.filter(key => key !== 'tags'),
    [metadataKeys],
  );

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
      if (searchResults !== null) {
        sessionStorage.setItem('pnotes_results', JSON.stringify(searchResults));
        sessionStorage.setItem('pnotes_results_version', PNOTES_RESULTS_VERSION);
      } else {
        sessionStorage.removeItem('pnotes_results');
        sessionStorage.removeItem('pnotes_results_version');
      }
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

  const isSummaryNote = useCallback((note: Note | null | undefined): boolean => {
    return Boolean(isObsidianMode && note?.searchText);
  }, [isObsidianMode]);

  const ensureFullNote = useCallback(async (noteOrId: Note | string): Promise<Note | null> => {
    const id = typeof noteOrId === 'string' ? noteOrId : noteOrId.id;
    const existing = typeof noteOrId === 'string'
      ? allNotes.find(n => n.id === id)
      : noteOrId;

    if (!isObsidianMode || !config.notePath || (existing && !isSummaryNote(existing))) {
      return existing ?? null;
    }

    const full = await localApi.getNoteByPath(id, config.notePath);
    setAllNotes(prev => {
      const updated = prev.map(note => note.id === id ? full : note);
      setCachedNotes(updated);
      return updated;
    });
    setGraphSelectedNote(prev => prev?.id === id ? full : prev);
    return full;
  }, [allNotes, config.notePath, isObsidianMode, isSummaryNote]);

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
        const chipNote = await ensureFullNote(chip.id);
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
      const hasIndexedLink = n.links?.some(link => (
        link === chipNote.id ||
        link === chipNote.title ||
        link.replace(/\.md$/i, '') === chipName
      ));
      if (n.id !== chipNote.id && (hasIndexedLink || n.content.includes(`[[${chipName}]]`))) {
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

    const chipNote = await ensureFullNote(noteChips[0].id);
    const targetNote = await ensureFullNote(targetId);
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

  const handleGraphConnect = useCallback(async (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    if (sourceId.startsWith('missing:') || targetId.startsWith('missing:')) {
      toast.info('這個節點尚未載入為筆記，無法直接建立雙向連結');
      return;
    }

    const cfg = storage.getConfig();
    if (!cfg.notePath && cfg.dataSource === 'obsidian') {
      toast.error('請先在設定中填寫 Vault 路徑');
      return;
    }

    const sourceNote = await ensureFullNote(sourceId);
    const targetNote = await ensureFullNote(targetId);
    if (!sourceNote || !targetNote) {
      toast.error('找不到筆記內容，請重新載入');
      return;
    }

    const sourceName = sourceNote.id.split('/').pop()?.replace(/\.md$/i, '') ?? sourceNote.title;
    const targetName = targetNote.id.split('/').pop()?.replace(/\.md$/i, '') ?? targetNote.title;
    const nextSourceContent = addLink(sourceNote.content, targetName);
    const nextTargetContent = addLink(targetNote.content, sourceName);
    const addedSourceLink = nextSourceContent !== sourceNote.content;
    const addedTargetLink = nextTargetContent !== targetNote.content;

    if (nextSourceContent === sourceNote.content && nextTargetContent === targetNote.content) {
      toast.info('這兩則筆記已經有雙向連結');
      return;
    }

    try {
      const now = new Date().toISOString();
      if (cfg.dataSource === 'obsidian') {
        await Promise.all([
          localApi.updateNote(sourceNote.id, cfg.notePath, nextSourceContent),
          localApi.updateNote(targetNote.id, cfg.notePath, nextTargetContent),
        ]);
      } else {
        await Promise.all([
          storage.updateNote(sourceNote.id, { content: nextSourceContent, updatedAt: now }),
          storage.updateNote(targetNote.id, { content: nextTargetContent, updatedAt: now }),
        ]);
      }

      setAllNotes(prev => {
        const updated = prev.map(n => {
          if (n.id === sourceNote.id) return { ...n, content: nextSourceContent, updatedAt: now };
          if (n.id === targetNote.id) return { ...n, content: nextTargetContent, updatedAt: now };
          return n;
        });
        setCachedNotes(updated);
        return updated;
      });
      if (graphSelectedNote?.id === sourceNote.id) setGraphSelectedNote(prev => prev ? { ...prev, content: nextSourceContent, updatedAt: now } : prev);
      if (graphSelectedNote?.id === targetNote.id) setGraphSelectedNote(prev => prev ? { ...prev, content: nextTargetContent, updatedAt: now } : prev);
      setLastGraphConnection({
        sourceId: sourceNote.id,
        targetId: targetNote.id,
        sourceTitle: sourceNote.title,
        targetTitle: targetNote.title,
        sourceName,
        targetName,
        removeSourceLink: addedSourceLink,
        removeTargetLink: addedTargetLink,
      });
      invalidateResultsCaches();
      toast.success('已建立雙向連結');
    } catch (err: any) {
      toast.error(`建立連結失敗: ${err.message}`);
    }
  }, [allNotes, ensureFullNote, graphSelectedNote?.id]);

  const handleUndoGraphConnection = useCallback(async () => {
    if (!lastGraphConnection) return;

    const cfg = storage.getConfig();
    if (!cfg.notePath && cfg.dataSource === 'obsidian') {
      toast.error('請先在設定中填寫 Vault 路徑');
      return;
    }

    const sourceNote = await ensureFullNote(lastGraphConnection.sourceId);
    const targetNote = await ensureFullNote(lastGraphConnection.targetId);
    if (!sourceNote || !targetNote) {
      toast.error('找不到上一筆連線的筆記，請重新載入');
      setLastGraphConnection(null);
      return;
    }

    const nextSourceContent = lastGraphConnection.removeSourceLink
      ? removeLink(sourceNote.content, lastGraphConnection.targetName)
      : sourceNote.content;
    const nextTargetContent = lastGraphConnection.removeTargetLink
      ? removeLink(targetNote.content, lastGraphConnection.sourceName)
      : targetNote.content;

    setGraphUndoingConnection(true);
    try {
      const now = new Date().toISOString();
      if (cfg.dataSource === 'obsidian') {
        await Promise.all([
          localApi.updateNote(sourceNote.id, cfg.notePath, nextSourceContent),
          localApi.updateNote(targetNote.id, cfg.notePath, nextTargetContent),
        ]);
      } else {
        await Promise.all([
          storage.updateNote(sourceNote.id, { content: nextSourceContent, updatedAt: now }),
          storage.updateNote(targetNote.id, { content: nextTargetContent, updatedAt: now }),
        ]);
      }

      setAllNotes(prev => {
        const updated = prev.map(n => {
          if (n.id === sourceNote.id) return { ...n, content: nextSourceContent, updatedAt: now };
          if (n.id === targetNote.id) return { ...n, content: nextTargetContent, updatedAt: now };
          return n;
        });
        setCachedNotes(updated);
        return updated;
      });
      if (graphSelectedNote?.id === sourceNote.id) setGraphSelectedNote(prev => prev ? { ...prev, content: nextSourceContent, updatedAt: now } : prev);
      if (graphSelectedNote?.id === targetNote.id) setGraphSelectedNote(prev => prev ? { ...prev, content: nextTargetContent, updatedAt: now } : prev);
      setLastGraphConnection(null);
      invalidateResultsCaches();
      toast.success('已取消上一筆拖曳連結');
    } catch (err: any) {
      toast.error(`取消連結失敗: ${err.message}`);
    } finally {
      setGraphUndoingConnection(false);
    }
  }, [allNotes, ensureFullNote, graphSelectedNote?.id, lastGraphConnection]);

  // ─────────────────────────────────────────────────────────────

  // Extract title + abstract + connect from YAML frontmatter,
  // falling back to markdown section headings if frontmatter fields are absent.
  const extractSearchContent = (note: Note): string => {
    const parts: string[] = [note.title];

    const fmAbstract = note.frontmatter?.abstract?.trim();
    const fmConnect = note.frontmatter?.connect?.trim();
    if (fmAbstract) parts.push(fmAbstract);
    if (fmConnect) parts.push(fmConnect);

    // ── 1. Parse YAML frontmatter ──────────────────────────────
    const fmMatch = parts.length === 1 ? note.content.match(/^---\s*\n([\s\S]*?)\n---/) : null;
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
    const isSameGraph = noteChips.length === 1 && noteChips[0].id === id;
    const searchContent = extractSearchContent(note);
    const newChips = [{ id, title: note.title, searchContent }];
    if (!isSameGraph && noteChips.length > 0) {
      setGraphHistory(prev => [...prev, noteChips.map(chip => ({ ...chip }))].slice(-50));
    }
    setNoteChips(newChips);
    setGraphSelectedNote(null);
    setGraphSelectedMissingTitle('');
    runSearch(newChips, '');
  }, [allNotes, noteChips]);

  const handleGraphBack = useCallback(() => {
    const previous = graphHistory[graphHistory.length - 1];
    if (!previous) return;
    const restored = previous.map(chip => ({ ...chip }));
    setGraphHistory(prev => prev.slice(0, -1));
    setNoteChips(restored);
    setGraphSelectedNote(null);
    setGraphSelectedMissingTitle('');
    runSearch(restored, '');
  }, [graphHistory]);

  const currentGraphSelectedNote = useMemo(() => {
    if (!graphSelectedNote) return null;
    return allNotes.find(n => n.id === graphSelectedNote.id) ?? graphSelectedNote;
  }, [allNotes, graphSelectedNote]);

  const graphPanelNote = currentGraphSelectedNote ?? (graphSelectedMissingTitle ? null : expandedCenterNote);
  const graphPanelTitle = currentGraphSelectedNote?.title
    ?? graphSelectedMissingTitle
    ?? expandedCenterNote?.title
    ?? noteChips[0]?.title;

  useEffect(() => {
    const note = graphPanelNote;
    graphEditContentRef.current = note?.content ?? '';
    setGraphEditMode(false);
  }, [graphPanelNote?.id]);

  useEffect(() => {
    if (!graphPanelNote || !isSummaryNote(graphPanelNote)) return;
    ensureFullNote(graphPanelNote.id).catch(err => {
      console.warn('[PermanentNotes] failed to load full graph note:', err.message);
    });
  }, [ensureFullNote, graphPanelNote, isSummaryNote]);

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
      const notes = await storage.getNotes({ summary: isObsidianMode });
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

  const buildLocalSearchFallback = (queryText: string, chips: NoteChip[]): NoteChunk[] => {
    const chipIds = makeNoteIdentitySet(chips.map(c => c.id));
    const terms = [...new Set(
      queryText
        .toLowerCase()
        .split(/[^\p{L}\p{N}_-]+/u)
        .map(term => term.trim())
        .filter(term => term.length >= 2)
    )].slice(0, 40);

    const scored = allNotes
      .filter(note => {
        const lowerId = note.id.toLowerCase();
        if (lowerId.startsWith('.trash/') || lowerId.includes('/.trash/')) return false;
        if (lowerId.includes('template') || lowerId.includes('模板')) return false;
        return true;
      })
      .map(note => {
        const title = note.title.toLowerCase();
        const haystack = `${title} ${extractSearchContent(note)} ${note.tags.join(' ')}`.toLowerCase();
        let score = noteIdentityParts(note.id).some(part => chipIds.has(part)) ? 100 : 0;
        for (const term of terms) {
          if (title.includes(term)) score += 8;
          if (haystack.includes(term)) score += 2;
        }
        return { note, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    return scored.map(({ note, score }) => ({
      notePath: note.id,
      content: note.content,
      similarity: Math.min(0.99, Math.max(0.05, score / 100)),
    }));
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
          return lower.includes('template') || lower.includes('模板') || lower.startsWith('.trash/') || lower.includes('/.trash/');
        };
        const seen = new Set<string>();
        const allChunks: NoteChunk[] = [];
        const searchFailures: string[] = [];

        const searchWithRetry = async (q: string): Promise<NoteChunk[]> => {
          let lastError: any;
          for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
              const result = await localApi.search(q);
              return result.chunks || [];
            } catch (err: any) {
              lastError = err;
              if (attempt === 0) await delay(600);
            }
          }
          throw lastError;
        };

        for (const q of queries) {
          try {
            const chunks = await searchWithRetry(q);
            for (const chunk of chunks) {
              if (!seen.has(chunk.notePath) && !isTemplatePath(chunk.notePath)) {
                seen.add(chunk.notePath);
                allChunks.push(chunk);
              }
            }
          } catch (err: any) {
            console.warn('[PermanentNotes] semantic search failed:', err.message);
            searchFailures.push(err.message || 'semantic search failed');
          }
        }
        if (searchFailures.length === queries.length) {
          const fallbackChunks = buildLocalSearchFallback(queries.join(' '), chips);
          if (fallbackChunks.length === 0) throw new Error(searchFailures[0] || '語意搜尋失敗');
          allChunks.push(...fallbackChunks);
          toast.info(`語意搜尋暫時不可用，已改用本地相關筆記排序（${searchFailures[0]}）`);
        }
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
    setGraphHistory([]);
    autoSearchedRef.current = false;
    try {
      sessionStorage.removeItem('pnotes_chips');
      sessionStorage.removeItem('pnotes_query');
      sessionStorage.removeItem('pnotes_results');
      sessionStorage.removeItem('pnotes_results_version');
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
      removeChip(note.id);
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
      const chipNotes = (await Promise.all(
        noteChips.map(async chip => {
          const note = allNotes.find(n => chip.id === n.id || chip.title === n.title);
          return note ? ensureFullNote(note) : null;
        })
      )).filter((note): note is Note => Boolean(note));
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
    const activeChip = noteChips[0];
    let nextChips = noteChips;
    try {
      let targetId = activeChip.id;
      try {
        const targetNote = await ensureFullNote(activeChip.id);
        targetId = targetNote?.id ?? activeChip.id;
      } catch (loadErr: any) {
        console.warn('[PermanentNotes] enrich target load failed, using chip id:', loadErr.message);
      }

      await localApi.enrichNote(targetId, config.notePath);
      invalidateResultsCaches();
      toast.success(`「${activeChip.title}」AI 填充完成`);

      try {
        const refreshed = sortByRecentActivity(await storage.reloadNotes({ summary: isObsidianMode }));
        setCachedNotes(refreshed);
        setAllNotes(refreshed);

        const refreshedTarget = refreshed.find(note => isSameNoteId(note.id, targetId));
        nextChips = noteChips.map((chip, index) => {
          if (index !== 0 || !refreshedTarget) return chip;
          return {
            id: refreshedTarget.id,
            title: refreshedTarget.title,
            searchContent: extractSearchContent(refreshedTarget),
          };
        });
        setNoteChips(nextChips);
        setSearchResults(null);
        autoSearchedRef.current = true;
      } catch (reloadErr: any) {
        toast.error(`筆記已填充，但重新載入失敗: ${reloadErr.message}`);
      }

      try {
        await runSearch(nextChips, '');
      } catch (searchErr: any) {
        toast.error(`AI 搜尋失敗: ${searchErr.message}`);
      }
    } catch (err: any) {
      toast.error(`Claude CLI 填充失敗: ${err.message}`);
    } finally {
      setIsEnriching(false);
    }
  };

  const handleGraphSave = async () => {
    const note = graphPanelNote;
    if (!note) return;
    setGraphSaving(true);
    try {
      const now = new Date().toISOString();
      const content = graphEditContentRef.current;
      await storage.updateNote(note.id, { content, updatedAt: now });
      const updated = { ...note, content, updatedAt: now };
      if (currentGraphSelectedNote) setGraphSelectedNote(updated);
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
        <div className="flex h-[525px] flex-1 min-w-0 flex-col">
          <QuickFleetNoteCreator
            templateContent={fleetTemplateContent}
            onCreate={handleCreateFleetNote}
          />

          {/* Thinking Models + AI Button — compact */}
          <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
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
        </div>

        {/* Right column — graph, ~half the row, flush to right edge */}
        <div
          className="flex-shrink-0 overflow-hidden flex"
          style={{
            width: noteChips.length >= 1 ? 600 : 0,
            opacity: noteChips.length >= 1 ? 1 : 0,
            transition: 'width 280ms ease, opacity 220ms ease',
          }}
        >
          <div className="rounded-xl border border-gray-200 bg-slate-50 shadow-sm overflow-hidden flex flex-col" style={{ width: 600, height: 525 }}>
            <div className="px-3 py-1.5 border-b border-gray-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0"
                      disabled={graphHistory.length === 0}
                      onClick={handleGraphBack}
                    >
                      <ArrowLeft className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>上一頁</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0"
                      disabled={!lastGraphConnection || graphUndoingConnection}
                      onClick={handleUndoGraphConnection}
                    >
                      {graphUndoingConnection ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {lastGraphConnection
                      ? `取消上一筆拖曳連結：${lastGraphConnection.sourceTitle} ↔ ${lastGraphConnection.targetTitle}`
                      : '沒有可取消的拖曳連結'}
                  </TooltipContent>
                </Tooltip>
                <span className="text-xs font-medium text-gray-500 shrink-0">連結圖譜</span>
              </div>
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
                    onNodeConnect={handleGraphConnect}
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0"
                    disabled={graphHistory.length === 0}
                    onClick={handleGraphBack}
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>上一頁</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0"
                    disabled={!lastGraphConnection || graphUndoingConnection}
                    onClick={handleUndoGraphConnection}
                  >
                    {graphUndoingConnection ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {lastGraphConnection
                    ? `取消上一筆拖曳連結：${lastGraphConnection.sourceTitle} ↔ ${lastGraphConnection.targetTitle}`
                    : '沒有可取消的拖曳連結'}
                </TooltipContent>
              </Tooltip>
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
              onClick={() => { setIsGraphExpanded(false); setGraphSelectedNote(null); setGraphSelectedMissingTitle(''); setMobileGraphPanelOpen(false); }}
            >
              <X className="size-4" />
            </Button>
          </div>
          {/* Desktop: side-by-side | Mobile: graph full-width + bottom sheet */}
          <div className={`flex-1 min-h-0 ${isMobile ? 'flex flex-col' : 'flex'}`}>
            <div className={`min-w-0 ${isMobile ? 'flex-1' : 'flex-1'}`}>
              <Suspense fallback={<div className="h-full flex items-center justify-center text-sm text-gray-500">載入圖譜中...</div>}>
                <NoteGraph
                  expanded
                  allNotes={allNotes}
                  centerNoteIds={graphCenterIds}
                  depth={graphDepth}
                  onDepthChange={setGraphDepth}
                  onNodeClick={(id, name) => {
                    const note = allNotes.find(n => n.id === id);
                    if (note) {
                      setGraphSelectedNote(note);
                      setGraphSelectedMissingTitle('');
                      if (isSummaryNote(note)) {
                        ensureFullNote(note).catch(err => {
                          console.warn('[PermanentNotes] failed to load graph note:', err.message);
                        });
                      }
                    } else {
                      setGraphSelectedNote(null);
                      setGraphSelectedMissingTitle(name || id.replace(/^missing:/, ''));
                    }
                    if (isMobile) setMobileGraphPanelOpen(true);
                  }}
                  onNodeCtrlClick={setGraphCenterNote}
                  onNodeConnect={isMobile ? undefined : handleGraphConnect}
                />
              </Suspense>
            </div>

            {/* Desktop sidebar */}
            {!isMobile && (
              <aside className="w-[420px] max-w-[34vw] min-w-[320px] shrink-0 border-l border-gray-200 bg-white flex flex-col">
                <div className="shrink-0 border-b border-gray-200 px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400">
                      {currentGraphSelectedNote ? '點擊的筆記' : graphSelectedMissingTitle ? '未載入的節點' : '中心筆記'}
                    </span>
                    {graphPanelNote && graphEditMode ? (
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
                    ) : graphPanelNote ? (
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
                    {graphPanelTitle}
                  </h2>
                </div>
                {graphPanelNote ? (
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {graphEditMode ? (
                      <Suspense fallback={<div className="p-4 text-sm text-gray-400">載入編輯器...</div>}>
                        <GraphNoteEditor
                          noteId={graphPanelNote.id}
                          initialContent={graphPanelNote.content}
                          contentRef={graphEditContentRef}
                          vaultPath={config.notePath}
                        />
                      </Suspense>
                    ) : (
                      <Suspense fallback={<div className="p-4 text-sm text-gray-400">載入預覽...</div>}>
                        <GraphNotePreview
                          noteId={graphPanelNote.id}
                          content={graphPanelNote.content}
                          vaultPath={config.notePath}
                        />
                      </Suspense>
                    )}
                  </div>
                ) : graphSelectedMissingTitle ? (
                  <div className="flex-1 flex items-center justify-center px-6 text-center text-sm text-gray-400">
                    這個節點目前不在已載入的筆記清單中，無法顯示內容。
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                    點擊圖譜節點以查看筆記內容
                  </div>
                )}
              </aside>
            )}

            {/* Mobile bottom sheet */}
            {isMobile && mobileGraphPanelOpen && (
              <div className="shrink-0 border-t border-gray-200 bg-white flex flex-col" style={{ height: '45vh' }}>
                <div className="shrink-0 border-b border-gray-200 px-4 py-2 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-gray-400">
                        {currentGraphSelectedNote ? '點擊的筆記' : graphSelectedMissingTitle ? '未載入的節點' : '中心筆記'}
                      </span>
                      {graphPanelNote && graphEditMode ? (
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
                      ) : graphPanelNote ? (
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
                    <h2 className="text-sm font-semibold text-gray-800 leading-snug line-clamp-1">
                      {graphPanelTitle}
                    </h2>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0 ml-2"
                    onClick={() => setMobileGraphPanelOpen(false)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
                {graphPanelNote ? (
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {graphEditMode ? (
                      <Suspense fallback={<div className="p-4 text-sm text-gray-400">載入編輯器...</div>}>
                        <GraphNoteEditor
                          noteId={graphPanelNote.id}
                          initialContent={graphPanelNote.content}
                          contentRef={graphEditContentRef}
                          vaultPath={config.notePath}
                        />
                      </Suspense>
                    ) : (
                      <Suspense fallback={<div className="p-4 text-sm text-gray-400">載入預覽...</div>}>
                        <GraphNotePreview
                          noteId={graphPanelNote.id}
                          content={graphPanelNote.content}
                          vaultPath={config.notePath}
                        />
                      </Suspense>
                    )}
                  </div>
                ) : graphSelectedMissingTitle ? (
                  <div className="flex-1 flex items-center justify-center px-6 text-center text-sm text-gray-400">
                    這個節點目前不在已載入的筆記清單中，無法顯示內容。
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                    點擊圖譜節點以查看筆記內容
                  </div>
                )}
              </div>
            )}
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
            {displayResults !== null ? `AI 搜尋相關筆記（${displayResults.length} 則）` : 'AI 搜尋相關筆記'}
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

                  const isInSearch = noteChipLookup.has(noteId) || noteChipLookup.has(fileName);

                  const handleChunkClick = (event: React.MouseEvent) => {
                    if (event.ctrlKey || event.metaKey) {
                      event.preventDefault();
                      navigate(`/obsidian-note/${encodeURIComponent(noteId)}`, { state: { note: fullNote ?? null } });
                      return;
                    }
                    if (isInSearch) {
                      removeChip(noteId);
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
                          className={`p-4 cursor-pointer hover:shadow-lg transition-all h-64 flex flex-col overflow-hidden relative ${isInSearch ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-white'}`}
                          style={{ contentVisibility: 'auto', containIntrinsicSize: '256px' }}
                          onClick={handleChunkClick}
                        >
                          <div className="flex items-start justify-between mb-2 shrink-0">
                            <h3 className="font-bold flex-1 max-h-[3em] overflow-hidden" style={{ fontSize: `${cardSizes.title}px` }}>{fileName}</h3>
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
                          {fullNote && nonTagMetadataKeys.map(key => {
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
                  const isInSearch = noteChipLookup.has(note.id) || noteChipLookup.has(note.title);
                  const noteTags = extractTags(note);
                  const preview = getContentPreview(note.content);
                  return (
                    <Tooltip key={note.id}>
                      <TooltipTrigger asChild>
                        <Card
                          className={`p-4 cursor-pointer hover:shadow-lg transition-all h-64 flex flex-col overflow-hidden ${isInSearch ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-blue-50 border-blue-200'}`}
                          style={{ contentVisibility: 'auto', containIntrinsicSize: '256px' }}
                          onClick={e => handleNoteClick(note, e)}
                        >
                          <h3 className="font-bold mb-2 shrink-0 max-h-[3em] overflow-hidden" style={{ fontSize: `${cardSizes.title}px` }}>{note.title}</h3>
                          {config.displayMetadataKeys.includes('tags') && noteTags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2 shrink-0 overflow-hidden max-h-[52px]">
                              {noteTags.map(tag => (
                                <Badge key={tag} variant="secondary" className="max-w-full truncate" style={{ fontSize: `${cardSizes.metadata}px` }}>#{tag}</Badge>
                              ))}
                            </div>
                          )}
                          {nonTagMetadataKeys.map(key => {
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
        <section className="mt-8">
          <h2 className="text-base font-semibold mb-3 text-gray-700">
            全部筆記（{allNotes.length} 則）
          </h2>
          <PermanentNotesGrid
            notes={allNotes}
            noteChipLookup={noteChipLookup}
            noteChipsLength={noteChips.length}
            activeChipId={noteChips[0]?.id}
            showTags={showTags}
            nonTagMetadataKeys={nonTagMetadataKeys}
            cardSizes={cardSizes}
            linkedNoteIds={linkedNoteIds}
            linkingNoteId={linkingNoteId}
            onNoteClick={handleNoteClick}
            onToggleLink={handleToggleLink}
          />
        </section>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <p>尚無筆記</p>
        </div>
      )}

    </div>
  );
}
