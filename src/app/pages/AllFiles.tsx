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
  tagsLower: string[];
  frontmatterText: string;
  searchText: string;
  updatedTime: number;
}

interface SearchHit {
  id: string;
  score: number;
  reasons: string[];
}

export function AllFiles() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [filteredNoteIds, setFilteredNoteIds] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const searchWorkerRef = useRef<Worker | null>(null);
  const searchRequestIdRef = useRef(0);
  const [workerReady, setWorkerReady] = useState(false);

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
          ? await storage.getNotes({ summary: true })
          : await storage.getNotes();
        const sorted = sortByRecentActivity(fetchedNotes);
        setNotes(sorted);
        setFilteredNoteIds(sorted.map(n => n.id));
      } catch (error: any) {
        console.error('Error fetching notes:', error);
        toast.error(`載入筆記失敗：${error?.message || error}`);
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
      const freshNotes = await storage.reloadNotes({ summary: true });
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
      tagsLower: (note.tags || []).map(tag => tag.toLowerCase()),
      frontmatterText: Object.values(note.frontmatter || {}).join(' ').toLowerCase(),
      searchText: (note.searchText || `${note.title} ${note.content}`).toLowerCase(),
      updatedTime: new Date(note.updatedAt).getTime() || new Date(note.createdAt).getTime() || 0,
    }));
  }, [notes]);
  const searchIndexVersion = useMemo(
    () => preparedNotes.map(note => `${note.id}:${note.updatedTime}`).join('\x00'),
    [preparedNotes]
  );

  const noteById = useMemo(() => {
    return new Map(notes.map(note => [note.id, note]));
  }, [notes]);

  useEffect(() => {
    if (typeof Worker === 'undefined') return;

    const worker = new Worker(new URL('../workers/notesSearch.worker.ts', import.meta.url), { type: 'module' });
    searchWorkerRef.current = worker;
    setWorkerReady(true);

    return () => {
      worker.terminate();
      if (searchWorkerRef.current === worker) searchWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const worker = searchWorkerRef.current;
    if (!worker) return;
    worker.postMessage({
      type: 'index',
      notes: preparedNotes,
      indexVersion: searchIndexVersion,
    });
  }, [preparedNotes, searchIndexVersion, workerReady]);

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
    };

    if (!worker) {
      runFallbackSearch();
      return;
    }

    worker.onmessage = (event: MessageEvent<{ requestId: number; results: SearchHit[] }>) => {
      if (event.data.requestId === searchRequestIdRef.current) {
        setFilteredNoteIds(event.data.results.map(result => result.id));
      }
    };
    worker.onerror = () => {
      if (requestId === searchRequestIdRef.current) runFallbackSearch();
    };
    const timer = window.setTimeout(() => {
      worker.postMessage({
        type: 'search',
        requestId,
        indexVersion: searchIndexVersion,
        searchTerm,
        selectedTags,
        searchMode,
        expandedKeywords,
      });
    }, 200);

    return () => window.clearTimeout(timer);
  }, [preparedNotes, searchIndexVersion, searchTerm, selectedTags, searchMode, expandedKeywords, workerReady]);

  const filteredNotes = useMemo(() => {
    return filteredNoteIds
      .map(id => noteById.get(id))
      .filter((note): note is Note => Boolean(note));
  }, [filteredNoteIds, noteById]);

  const pageNotes = useMemo(
    () => filteredNotes.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filteredNotes, page]
  );
  const virtualVisibleNotes = { items: pageNotes, paddingTop: 0, paddingBottom: 0 };

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
      if (isObsidianMode && config.notePath) {
        const noteMap = new Map(notes.map(n => [n.id, n]));
        await Promise.all(
          Array.from(selectedNotes).map(id => {
            const note = noteMap.get(id);
            const relativePath = note?.id ?? id;
            return localApi.deleteNote(relativePath, config.notePath!);
          })
        );
      } else {
        await Promise.all(Array.from(selectedNotes).map(id => storage.deleteNote(id)));
      }
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
      className="px-3 py-4 md:p-6"
      ref={containerRef}
      style={{ userSelect: isSelecting ? 'none' : 'auto' }}
    >
      <div className="mb-4 md:mb-6 flex items-center justify-between gap-2">
        <h1 className="text-lg md:text-2xl font-semibold">所有檔案</h1>
        <div className="flex items-center gap-2 shrink-0">
          {isObsidianMode && (
            <Button variant="outline" size="sm" onClick={handleReload} disabled={isReloading} className="flex items-center gap-1.5">
              <RefreshCw className={`size-4 ${isReloading ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">重新載入</span>
            </Button>
          )}
          <Button size="sm" onClick={() => handleCreateNote('fleet')} className="flex items-center gap-1.5">
            <Plus className="size-4" />
            <span className="hidden md:inline">創建閃念筆記</span>
            <span className="md:hidden">新增</span>
          </Button>
        </div>
      </div>

      {selectedNotes.size > 0 && (
        <p className="text-xs text-blue-600 mb-3">
          已選取 {selectedNotes.size} 則筆記・長按顯示操作選單
        </p>
      )}

      {/* Search Bar */}
      <div className="mb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            {(qmdLoading || isExpandingQuery)
              ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-blue-400 animate-spin" />
              : searchMode === 'semantic'
                ? <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-purple-400" />
                : <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            }
            <Input
              type="text"
              placeholder={isObsidianMode ? '提問後按 Enter 搜尋...' : '搜尋筆記...'}
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="pl-9 text-sm"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSuggestTags}
            disabled={!searchTerm.trim() || allTags.length === 0 || isSuggestingTags}
            className="shrink-0 px-2.5"
            title="AI 建議標籤"
          >
            {isSuggestingTags
              ? <Loader2 className="size-4 animate-spin" />
              : <Sparkles className="size-4" />
            }
            <span className="hidden md:inline ml-1.5">AI 建議標籤</span>
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
        <div className="mb-4">
          <div className="mb-3 text-xs text-gray-500">
            找到 {qmdResult.chunks.length} 則相關筆記
            {qmdResult.searchTime && <span className="ml-2">({qmdResult.searchTime}ms)</span>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
            <div className="mb-4 flex gap-5 text-xs overflow-x-auto pb-1">
              {(['1project', '2task', '3card'] as const).map(prefix => {
                const catNode = tagTree.get(prefix);
                if (!catNode) return null;
                const label = prefix === '1project' ? 'Project' : prefix === '2task' ? 'Task' : 'Card';
                const renderChildren = (nodes: Map<string, TagNode>, depth: number): React.ReactNode =>
                  Array.from(nodes.values()).map(node => (
                    <div key={node.fullPath}>
                      <div
                        style={{ paddingLeft: `${depth * 14}px` }}
                        className={`flex items-center gap-1 py-0.5 ${
                          node.isTag
                            ? selectedTags.includes(node.fullPath)
                              ? 'text-blue-700 font-medium cursor-pointer'
                              : 'text-gray-700 hover:text-blue-600 cursor-pointer'
                            : 'text-gray-500 pointer-events-none'
                        }`}
                        onClick={() => { if (node.isTag) toggleTag(node.fullPath); }}
                      >
                        {depth > 0 && <span className="text-gray-300 mr-0.5">└</span>}
                        <span>{node.segment}</span>
                        {node.isTag && selectedTags.includes(node.fullPath) && (
                          <X className="size-3 ml-1 shrink-0" />
                        )}
                      </div>
                      {renderChildren(node.children, depth + 1)}
                    </div>
                  ));
                return (
                  <div key={prefix} className="flex flex-col">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</div>
                    {renderChildren(catNode.children, 0)}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">
              {filteredNotes.length} 則・第 {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredNotes.length)}
            </span>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-7 px-2 text-xs">‹</Button>
              <span className="text-xs text-gray-500">{page + 1}/{Math.ceil(filteredNotes.length / PAGE_SIZE) || 1}</span>
              <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= filteredNotes.length} onClick={() => setPage(p => p + 1)} className="h-7 px-2 text-xs">›</Button>
            </div>
          </div>

          {loading && (
            <div className="text-center py-12 text-gray-500">
              <Loader2 className="animate-spin size-5 mx-auto" />
            </div>
          )}

          {/* Notes Grid */}
          {filteredNotes.length > 0 && (
            <div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-4 select-none"
              style={{ paddingTop: virtualVisibleNotes.paddingTop, paddingBottom: virtualVisibleNotes.paddingBottom }}
            >
              {virtualVisibleNotes.items.map((note) => {
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
