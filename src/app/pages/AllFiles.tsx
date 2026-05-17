import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { storage, sortByRecentActivity } from '../utils/storage';
import { localApi } from '../utils/api';
import { Search, X, Loader2, Plus, Trash2, Sparkles, RefreshCw } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { Note } from '../types/note';
import { AISearchResult } from '../types/ai-search';
import { toast } from 'sonner';
import { useDragSelect } from '../hooks/useDragSelect';
import { getCardFontSizes } from '../utils/noteCardSizes';
import { buildNoteContent } from '../utils/buildNoteContent';
import { parseFrontmatterValue } from '../utils/frontmatter';
import { NoteCard } from '../components/NoteCard';

interface TagNode {
  segment: string;
  fullPath: string;
  children: Map<string, TagNode>;
  isTag: boolean;
}

interface PreparedNote {
  id: string;
  title: string;
  tags: string[];
  frontmatter: Record<string, string>;
  content: string;
  searchText: string;
  updatedTime: number;
}

interface SearchHit {
  id: string;
  score: number;
  reasons: string[];
}

interface VisibleNote {
  note: Note;
  preview: string;
  metadata: Array<{ key: string; value: string }>;
  hit?: SearchHit;
}

function makePreview(content: string): string {
  return content
    .replace(/^---\s*\n[\s\S]*?\n---\s*\n*/, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*|__|\*|_|~~|`/g, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
    .substring(0, 300);
}

function getMetadataValue(note: Note, key: string): string {
  return note.frontmatter?.[key] || parseFrontmatterValue(note.content, key);
}

export function AllFiles() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [filteredNoteIds, setFilteredNoteIds] = useState<string[]>([]);
  const [searchHits, setSearchHits] = useState<Map<string, SearchHit>>(new Map());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const searchWorkerRef = useRef<Worker | null>(null);
  const searchRequestIdRef = useRef(0);

  // QMD search state (obsidian mode)
  const [qmdResult, setQmdResult] = useState<AISearchResult | null>(null);
  const [qmdLoading, setQmdLoading] = useState(false);

  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [isSuggestingTags, setIsSuggestingTags] = useState(false);

  // Dual-mode search
  const [searchMode, setSearchMode] = useState<'text' | 'semantic'>('text');
  const [expandedKeywords, setExpandedKeywords] = useState<string[]>([]);
  const [isExpandingQuery, setIsExpandingQuery] = useState(false);

  // Pagination
  const PAGE_SIZE = 100;
  const [page, setPage] = useState(0);

  const config = useMemo(() => storage.getConfig(), []);
  const isObsidianMode = config.dataSource === 'obsidian';
  const cardSizes = useMemo(() => getCardFontSizes(config), [config]);
  const displayMetadataKeys = useMemo(
    () => config.displayMetadataKeys.filter(key => key !== 'tags'),
    [config.displayMetadataKeys]
  );

  const {
    isSelecting,
    selectionBox,
    isInSelectionBox,
    getSelectionBoxStyle,
    shouldClearSelection
  } = useDragSelect(containerRef);

  useEffect(() => {
    const fetchNotes = async () => {
      try {
        setLoading(true);
        const fetchedNotes = isObsidianMode && config.notePath
          ? await localApi.getNotes(config.notePath, { summary: true })
          : await storage.getNotes();
        const sorted = sortByRecentActivity(fetchedNotes);
        setNotes(sorted);
        setFilteredNoteIds(sorted.map(n => n.id));
      } catch (error) {
        console.error('Error fetching notes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNotes();
  }, [config.notePath, isObsidianMode]);

  const [isReloading, setIsReloading] = useState(false);
  const handleReload = async () => {
    if (isReloading) return;
    setIsReloading(true);
    try {
      const vaultPath = config.notePath || '';
      if (!vaultPath) { toast.error('請先在設定頁面填寫 Obsidian Vault 路徑'); return; }
      const freshNotes = await localApi.reloadNotes(vaultPath, { summary: true });
      const freshSorted = sortByRecentActivity(freshNotes);
      setNotes(freshSorted);
      setFilteredNoteIds(freshSorted.map(n => n.id));
      toast.success(`已重新載入，共 ${freshNotes.length} 則筆記`);
    } catch (err: any) {
      toast.error(`重新載入失敗：${err.message}`);
    } finally {
      setIsReloading(false);
    }
  };

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach(note => {
      note.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [notes]);

  const tagTree = useMemo(() => {
    const root = new Map<string, TagNode>();
    for (const tag of allTags) {
      const parts = tag.split('/');
      let current = root;
      let path = '';
      for (let i = 0; i < parts.length; i++) {
        const seg = parts[i];
        path = path ? `${path}/${seg}` : seg;
        if (!current.has(seg)) {
          current.set(seg, { segment: seg, fullPath: path, children: new Map(), isTag: false });
        }
        if (i === parts.length - 1) current.get(seg)!.isTag = true;
        current = current.get(seg)!.children;
      }
    }
    return root;
  }, [allTags]);

  const preparedNotes = useMemo<PreparedNote[]>(() => {
    return notes.map(note => ({
      id: note.id,
      title: note.title,
      tags: note.tags || [],
      frontmatter: note.frontmatter || {},
      content: note.content || '',
      searchText: (note.searchText || `${note.title} ${note.content}`).toLowerCase(),
      updatedTime: new Date(note.updatedAt).getTime() || new Date(note.createdAt).getTime() || 0,
    }));
  }, [notes]);

  const noteById = useMemo(() => {
    return new Map(notes.map(note => [note.id, note]));
  }, [notes]);

  useEffect(() => {
    if (typeof Worker === 'undefined') return;

    const worker = new Worker(new URL('../workers/notesSearch.worker.ts', import.meta.url), { type: 'module' });
    searchWorkerRef.current = worker;

    return () => {
      worker.terminate();
      if (searchWorkerRef.current === worker) searchWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const requestId = ++searchRequestIdRef.current;
    const worker = searchWorkerRef.current;

    const runFallbackSearch = () => {
      const normalizedSearch = searchTerm.trim().toLowerCase();
      const terms = searchMode === 'semantic' && expandedKeywords.length > 0
        ? expandedKeywords.map(kw => kw.trim().toLowerCase()).filter(Boolean)
        : normalizedSearch.split(/\s+/).filter(Boolean);
      const openedMap = storage.getRecentlyOpenedMap();
      const ids = preparedNotes
        .filter(note => selectedTags.every(tag => note.tags.includes(tag)))
        .filter(note => terms.length === 0 || terms.some(term => note.searchText.includes(term)))
        .sort((a, b) => {
          const aTime = Math.max(a.updatedTime, openedMap[a.id] || 0);
          const bTime = Math.max(b.updatedTime, openedMap[b.id] || 0);
          return bTime - aTime;
        })
        .map(note => note.id);
      setFilteredNoteIds(ids);
      setSearchHits(new Map(ids.map(id => [id, { id, score: 0, reasons: [] }])));
    };

    if (!worker) {
      runFallbackSearch();
      return;
    }

    worker.onmessage = (event: MessageEvent<{ requestId: number; results: SearchHit[] }>) => {
      if (event.data.requestId === searchRequestIdRef.current) {
        setFilteredNoteIds(event.data.results.map(result => result.id));
        setSearchHits(new Map(event.data.results.map(result => [result.id, result])));
      }
    };
    worker.onerror = () => {
      if (requestId === searchRequestIdRef.current) runFallbackSearch();
    };
    const timer = window.setTimeout(() => {
      worker.postMessage({
        requestId,
        notes: preparedNotes,
        searchTerm,
        selectedTags,
        searchMode,
        expandedKeywords,
      });
    }, 200);

    return () => window.clearTimeout(timer);
  }, [preparedNotes, searchTerm, selectedTags, searchMode, expandedKeywords]);

  const filteredNotes = useMemo(() => {
    return filteredNoteIds
      .map(id => noteById.get(id))
      .filter((note): note is Note => Boolean(note));
  }, [filteredNoteIds, noteById]);

  const visibleNotes = useMemo<VisibleNote[]>(() => {
    return filteredNotes
      .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
      .map(note => ({
        note,
        preview: makePreview(note.content),
        metadata: displayMetadataKeys
          .map(key => ({ key, value: getMetadataValue(note, key) }))
          .filter(item => Boolean(item.value)),
        hit: searchHits.get(note.id),
      }));
  }, [filteredNotes, page, displayMetadataKeys, searchHits]);

  const handleQmdSearch = async (query: string) => {
    if (!query.trim()) {
      setQmdResult(null);
      return;
    }
    setQmdLoading(true);
    try {
      const result = await localApi.search(query.trim());
      setQmdResult(result);
    } catch (error: any) {
      toast.error(`搜尋失敗: ${error.message}`);
    } finally {
      setQmdLoading(false);
    }
  };

  const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSearchMode('text');
      setExpandedKeywords([]);
      return;
    }
    if (e.key === 'Enter') {
      if (isObsidianMode) {
        handleQmdSearch(searchTerm);
        return;
      }
      if (!searchTerm.trim()) return;
      setIsExpandingQuery(true);
      try {
        const keywords = await localApi.expandQuery(searchTerm);
        setExpandedKeywords(keywords);
        setSearchMode('semantic');
      } catch (err: any) {
        toast.error(`語義展開失敗：${err.message}`);
      } finally {
        setIsExpandingQuery(false);
      }
    }
  };

  const handleSuggestTags = async () => {
    if (!searchTerm.trim() || allTags.length === 0) return;
    setIsSuggestingTags(true);
    try {
      const suggestions = await localApi.suggestTags(searchTerm, allTags);
      setSuggestedTags(suggestions);
      if (suggestions.length === 0) toast.info('找不到相關標籤');
    } catch (err: any) {
      toast.error(`AI 建議失敗: ${err.message}`);
    } finally {
      setIsSuggestingTags(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setPage(0);
    if (!value.trim()) {
      setQmdResult(null);
      setSuggestedTags([]);
      setSearchMode('text');
      setExpandedKeywords([]);
    } else if (searchMode === 'semantic') {
      // 重新輸入時切回 text 模式
      setSearchMode('text');
      setExpandedKeywords([]);
    }
  };

  const toggleTag = (tag: string) => {
    setPage(0);
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleNoteClick = (note: Note, event: React.MouseEvent) => {
    storage.recordOpened(note.id);
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      // Ctrl+click opens edit mode
      const isObsidianNote = note.id.includes('/') || note.id.endsWith('.md');
      if (isObsidianNote) {
        navigate(`/obsidian-note/${encodeURIComponent(note.id)}`);
      } else if (note.type === 'fleet') {
        navigate(`/fleet-notes/${encodeURIComponent(note.id)}`);
      } else if (note.type === 'source') {
        navigate(`/source-notes/${encodeURIComponent(note.id)}?mode=edit`);
      } else {
        navigate(`/permanent-notes/${encodeURIComponent(note.id)}`);
      }
      return;
    }

    const tagStr = (note.tags || []).join(' ');
    const searchContent = tagStr ? `${note.title} ${tagStr}` : note.title;
    navigate('/permanent-notes', { state: { searchQuery: note.title, searchContent, noteId: note.id } });
  };

  const handleCreateNote = (type: Note['type']) => {
    let noteContent = '';
    let noteTitle = '';
    let defaultTags: string[] = [];

    if (type === 'fleet') {
      noteContent = buildNoteContent(config.fleetNoteTemplate);
      noteTitle = '新閃念筆記';
      defaultTags = config.fleetNoteTags || [];
    } else if (type === 'source') {
      noteContent = buildNoteContent(config.sourceNoteTemplate);
      noteTitle = '新文獻筆記';
      defaultTags = config.sourceNoteTags || [];
    } else {
      noteContent = buildNoteContent(config.permanentNoteTemplate);
      noteTitle = '新永久筆記';
    }

    const state = { title: noteTitle, content: noteContent, type, tags: defaultTags };
    if (type === 'fleet') {
      navigate('/fleet-notes/new', { state });
    } else if (type === 'source') {
      navigate('/source-notes/new', { state });
    } else {
      navigate('/permanent-notes/new', { state });
    }
  };

  const handleContextMenu = (event: React.MouseEvent, note: Note) => {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedNotes.has(note.id)) {
      setSelectedNotes(new Set([note.id]));
    }
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const handleDeleteSelected = async () => {
    if (selectedNotes.size === 0) return;
    const confirmMsg = selectedNotes.size === 1
      ? '確定要刪除這則筆記嗎？'
      : `確定要刪除 ${selectedNotes.size} 則筆記嗎？`;
    if (!confirm(confirmMsg)) {
      setContextMenu(null);
      return;
    }
    try {
      await Promise.all(Array.from(selectedNotes).map(id => storage.deleteNote(id)));
      toast.success(`已刪除 ${selectedNotes.size} 則筆記`);
      setNotes(prev => prev.filter(n => !selectedNotes.has(n.id)));
      setSelectedNotes(new Set());
      setContextMenu(null);
    } catch (error: any) {
      toast.error(`刪除失敗: ${error.message}`);
    }
  };

  const closeContextMenu = () => setContextMenu(null);

  useEffect(() => {
    const handleClick = () => closeContextMenu();
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  useEffect(() => {
    if (isSelecting && selectionBox) {
      const selected = new Set<string>();
      cardRefs.current.forEach((element, noteId) => {
        if (isInSelectionBox(element)) selected.add(noteId);
      });
      setSelectedNotes(selected);
    }
    if (shouldClearSelection) setSelectedNotes(new Set());
  }, [isSelecting, selectionBox, isInSelectionBox, shouldClearSelection]);

  return (
    <div
      className="p-6"
      ref={containerRef}
      style={{ userSelect: isSelecting ? 'none' : 'auto' }}
    >
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-2">所有檔案與搜尋</h1>
          <p className="text-gray-600">
            {isObsidianMode ? '輸入問題後按 Enter 搜尋 Obsidian 筆記庫' : '搜尋並管理您的所有筆記'}
          </p>
          {selectedNotes.size > 0 && (
            <p className="text-sm text-blue-600 mt-2">
              已選取 {selectedNotes.size} 則筆記（拖曳選取）- 右鍵點擊以顯示操作選單
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isObsidianMode && (
            <Button variant="outline" onClick={handleReload} disabled={isReloading} className="flex items-center gap-2">
              <RefreshCw className={`size-4 ${isReloading ? 'animate-spin' : ''}`} />
              重新載入
            </Button>
          )}
          <Button onClick={() => handleCreateNote('fleet')} className="flex items-center gap-2">
            <Plus className="size-5" />
            創建閃念筆記
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            {(qmdLoading || isExpandingQuery)
              ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-blue-400 animate-spin" />
              : searchMode === 'semantic'
                ? <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-purple-400" />
                : <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
            }
            <Input
              type="text"
              placeholder={isObsidianMode ? '向 Obsidian 筆記庫提問，按 Enter 搜尋...' : '搜尋筆記（Enter 切換語義搜尋）...'}
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="pl-10"
            />
          </div>
          <Button
            variant="outline"
            onClick={handleSuggestTags}
            disabled={!searchTerm.trim() || allTags.length === 0 || isSuggestingTags}
            className="flex items-center gap-2 whitespace-nowrap"
          >
            {isSuggestingTags
              ? <Loader2 className="size-4 animate-spin" />
              : <Sparkles className="size-4" />
            }
            AI 建議標籤
          </Button>
        </div>

        {/* 語義展開關鍵字 badges */}
        {searchMode === 'semantic' && expandedKeywords.length > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-purple-400 flex items-center gap-1">
              <Sparkles className="size-3" /> 語義展開：
            </span>
            {expandedKeywords.map(kw => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-800"
              >
                {kw}
                <button
                  onClick={() => setExpandedKeywords(prev => prev.filter(k => k !== kw))}
                  className="hover:text-purple-600 ml-0.5"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* AI 建議 chips */}
        {suggestedTags.length > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">AI 建議：</span>
            {suggestedTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm transition-colors ${
                  selectedTags.includes(tag)
                    ? 'bg-amber-300 text-amber-900'
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                }`}
              >
                #{tag}
                {selectedTags.includes(tag) && <span className="text-xs">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* QMD Search Results (obsidian mode) */}
      {isObsidianMode && qmdResult && (
        <div className="mb-6">
          <div className="mb-4 text-sm text-gray-600">
            找到 {qmdResult.chunks.length} 則相關筆記
            {qmdResult.searchTime && <span className="ml-2 text-gray-400">({qmdResult.searchTime}ms)</span>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {qmdResult.chunks.map((chunk, i) => {
              const fileName = chunk.notePath.split('/').pop()?.replace('.md', '') || chunk.notePath;
              const cleanSnippet = chunk.content.replace(/^@@[^@]*@@[^\n]*\n?/, '').trim();
              const title = fileName;
              const noteId = chunk.notePath.replace(/^qmd:\/\/[^/]+\//, '');
              const handleChunkClick = (event: React.MouseEvent) => {
                if (event.ctrlKey || event.metaKey) {
                  event.preventDefault();
                  navigate(`/obsidian-note/${encodeURIComponent(noteId)}`);
                } else {
                  // Normal click: go to connection page and search by note title
                  navigate('/permanent-notes', { state: { searchQuery: fileName, searchContent: fileName, noteId: noteId } });
                }
              };

              return (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <Card
                      className="p-4 cursor-pointer hover:shadow-lg transition-all bg-white h-64 flex flex-col relative"
                      onClick={handleChunkClick}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-bold line-clamp-1 flex-1" style={{ fontSize: `${cardSizes.title}px` }}>{title}</h3>
                        <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 ml-2 flex-shrink-0">
                          {(chunk.similarity * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="text-gray-600 overflow-hidden flex-1">
                        <p className="leading-normal whitespace-pre-line break-words" style={{ fontSize: `${cardSizes.body}px` }}>{cleanSnippet}</p>
                      </div>
                      <p className="text-gray-400 font-mono truncate mt-1" style={{ fontSize: `${cardSizes.metadata}px` }}>{noteId}</p>
                    </Card>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>點擊查找連結・Ctrl+Click 開啟編輯</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters — hidden in obsidian mode when showing results */}
      {!(isObsidianMode && qmdResult) && (
        <>
          {/* Tags Filter */}
          {allTags.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3">標籤篩選</h3>
              <div className="flex gap-8 text-sm">
                {Array.from(tagTree.values()).map(catNode => (
                  <div key={catNode.fullPath} className="min-w-0">
                    <div className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">
                      {catNode.segment}
                    </div>
                    {(function renderChildren(nodes: Map<string, TagNode>, depth: number): React.ReactNode {
                      return Array.from(nodes.values()).map(node => (
                        <div key={node.fullPath}>
                          <div
                            style={{ paddingLeft: `${depth * 12}px` }}
                            className={`flex items-center gap-1 py-0.5 rounded ${
                              node.isTag
                                ? selectedTags.includes(node.fullPath)
                                  ? 'text-blue-700 font-medium cursor-pointer'
                                  : 'text-gray-700 hover:text-blue-600 cursor-pointer'
                                : 'text-gray-400 pointer-events-none'
                            }`}
                            onClick={() => { if (node.isTag) toggleTag(node.fullPath); }}
                          >
                            {depth > 0 && <span className="text-gray-300 mr-1">└</span>}
                            <span>{node.segment}</span>
                            {node.isTag && selectedTags.includes(node.fullPath) && (
                              <X className="size-3 ml-1 flex-shrink-0" />
                            )}
                          </div>
                          {renderChildren(node.children, depth + 1)}
                        </div>
                      ));
                    })(catNode.children, 0)}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-gray-600 flex items-center gap-2">
              共 {filteredNotes.length} 則筆記，顯示第 {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredNotes.length)} 則
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>上一頁</Button>
              <span className="text-sm text-gray-500 self-center">{page + 1} / {Math.ceil(filteredNotes.length / PAGE_SIZE) || 1}</span>
              <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= filteredNotes.length} onClick={() => setPage(p => p + 1)}>下一頁</Button>
            </div>
          </div>

          {loading && (
            <div className="text-center py-12 text-gray-500">
              <Loader2 className="animate-spin size-5 mx-auto" />
            </div>
          )}

          {/* Notes Grid */}
          {filteredNotes.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 select-none">
              {visibleNotes.map(({ note }) => {
                const isSelected = selectedNotes.has(note.id);
                return (
                  <div
                    key={note.id}
                    ref={(el) => {
                      if (el) cardRefs.current.set(note.id, el);
                      else cardRefs.current.delete(note.id);
                    }}
                    className={`relative ${isSelected ? 'ring-2 ring-blue-500 rounded-lg shadow-lg' : ''}`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs z-10">
                        ✓
                      </div>
                    )}
                    <NoteCard
                      note={note}
                      sizes={cardSizes}
                      onClick={(event) => handleNoteClick(note, event)}
                      onContextMenu={(event) => handleContextMenu(event, note)}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {filteredNotes.length === 0 && !loading && (
            <div className="text-center py-12 text-gray-500">
              {searchTerm || selectedTags.length > 0
                ? '沒有符合條件的筆記'
                : '尚無筆記，開始創建您的第一則筆記吧！'
              }
            </div>
          )}
        </>
      )}

      {/* 右鍵選單 */}
      {contextMenu && (
        <div
          className="fixed bg-white border shadow-lg rounded-lg z-50 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full px-4 py-2 text-sm text-left text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
            onClick={handleDeleteSelected}
          >
            <Trash2 className="size-4" />
            刪除選中的筆記 ({selectedNotes.size})
          </button>
        </div>
      )}

      {/* 拖曳框 */}
      {isSelecting && getSelectionBoxStyle() && (
        <div style={getSelectionBoxStyle()!} />
      )}
    </div>
  );
}
