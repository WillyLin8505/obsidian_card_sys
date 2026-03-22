import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { storage } from '../utils/storage';
import { localApi } from '../utils/api';
import { Search, X, Loader2, Plus, Trash2 } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Note } from '../types/note';
import { AISearchResult } from '../types/ai-search';
import { toast } from 'sonner';
import { useDragSelect } from '../hooks/useDragSelect';

export function AllFiles() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  // QMD search state (obsidian mode)
  const [qmdResult, setQmdResult] = useState<AISearchResult | null>(null);
  const [qmdLoading, setQmdLoading] = useState(false);

  // Pagination
  const PAGE_SIZE = 100;
  const [page, setPage] = useState(0);

  const config = useMemo(() => storage.getConfig(), []);
  const isObsidianMode = config.dataSource === 'obsidian';

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
        const fetchedNotes = await storage.getNotes();
        setNotes(fetchedNotes);
      } catch (error) {
        console.error('Error fetching notes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNotes();
  }, []);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach(note => {
      note.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [notes]);

  const filteredNotes = useMemo(() => {
    return notes
      .filter(note => {
        const matchesSearch = searchTerm === '' ||
          note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          note.content.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesTags = selectedTags.length === 0 ||
          selectedTags.every(tag => note.tags?.includes(tag));
        return matchesSearch && matchesTags;
      })
      .sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  }, [notes, searchTerm, selectedTags]);

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

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isObsidianMode) {
      handleQmdSearch(searchTerm);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setPage(0);
    if (!value.trim()) setQmdResult(null);
  };

  const toggleTag = (tag: string) => {
    setPage(0);
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const toggleType = (type: Note['type']) => {
    setPage(0);
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const getTypeLabel = (type: Note['type']) => {
    switch (type) {
      case 'fleet': return '閃念筆記';
      case 'source': return '文獻筆記';
      case 'permanent': return '永久筆記';
    }
  };

  const handleNoteClick = (note: Note, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      setSelectedNotes(prev => {
        const newSet = new Set(prev);
        if (newSet.has(note.id)) {
          newSet.delete(note.id);
        } else {
          newSet.add(note.id);
        }
        return newSet;
      });
      return;
    }

    if (isObsidianMode) {
      navigate(`/obsidian-note/${encodeURIComponent(note.id)}`);
      return;
    }

    if (note.type === 'fleet') {
      navigate(`/fleet-notes/${note.id}`);
    } else if (note.type === 'source') {
      navigate(`/source-notes/${note.id}`);
    } else {
      navigate('/permanent-notes', { state: { selectedNoteId: note.id } });
    }
  };

  const handleCreateNote = async (type: Note['type']) => {
    const config = storage.getConfig();
    const currentDate = new Date().toISOString().split('T')[0];

    const frontmatter = `---
create date: ${currentDate}
aliases:
tags:
---

`;

    let templateContent = '';
    let noteTitle = '';

    if (type === 'fleet') {
      templateContent = config.fleetNoteTemplate || '';
      noteTitle = '新閃念筆記';
    } else if (type === 'source') {
      templateContent = config.sourceNoteTemplate || '';
      noteTitle = '新文獻筆記';
    } else {
      templateContent = config.permanentNoteTemplate || '';
      noteTitle = '新永久筆記';
    }

    const newNote: Note = {
      id: '',
      title: noteTitle,
      content: frontmatter + templateContent,
      type,
      tags: [],
      links: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const createdNote = await storage.addNote(newNote);
      if (type === 'fleet') {
        navigate(`/fleet-notes/${createdNote.id}`);
      } else if (type === 'source') {
        navigate(`/source-notes/${createdNote.id}`);
      } else {
        navigate(`/permanent-notes?noteId=${createdNote.id}`);
      }
      toast.success('筆記已建立');
    } catch (error) {
      console.error('Failed to create note:', error);
      toast.error('創建筆記失敗');
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
      setSelectedNotes(new Set());
      setContextMenu(null);
      const fetchedNotes = await storage.getNotes();
      setNotes(fetchedNotes);
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
              已選取 {selectedNotes.size} 則筆記 - 右鍵點擊以顯示操作選單
            </p>
          )}
        </div>
        <Button onClick={() => handleCreateNote('fleet')} className="flex items-center gap-2">
          <Plus className="size-5" />
          創建閃念筆記
        </Button>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          {qmdLoading
            ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-blue-400 animate-spin" />
            : <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
          }
          <Input
            type="text"
            placeholder={isObsidianMode ? '向 Obsidian 筆記庫提問，按 Enter 搜尋...' : '搜尋筆記標題或內容...'}
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="pl-10"
          />
        </div>
      </div>

      {/* QMD Search Results (obsidian mode) */}
      {isObsidianMode && qmdResult && (
        <div className="mb-6">
          <div className="mb-4 text-sm text-gray-600">
            找到 {qmdResult.chunks.length} 則相關筆記
            {qmdResult.searchTime && <span className="ml-2 text-gray-400">({qmdResult.searchTime}ms)</span>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {qmdResult.chunks.map((chunk, i) => {
              const fileName = chunk.notePath.split('/').pop()?.replace('.md', '') || chunk.notePath;
              const folderPath = chunk.notePath.split('/').slice(0, -1).join('/');
              const cleanSnippet = chunk.content.replace(/^@@.*@@.*\n/, '').trim();

              return (
                <div
                  key={i}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-white cursor-default"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="flex-1 text-sm font-semibold leading-snug">{chunk.metadata?.title || fileName}</h3>
                    <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 ml-2 flex-shrink-0">
                      {(chunk.similarity * 100).toFixed(0)}%
                    </span>
                  </div>

                  {fileName !== (chunk.metadata?.title || fileName) && (
                    <p className="text-xs text-gray-400 mb-2">{fileName}</p>
                  )}

                  <p className="text-gray-600 text-[12px] line-clamp-4 mb-3">
                    {cleanSnippet.substring(0, 200)}{cleanSnippet.length > 200 ? '...' : ''}
                  </p>

                  {folderPath && (
                    <p className="text-xs text-gray-400 truncate">{folderPath}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters — hidden in obsidian mode when showing results */}
      {!(isObsidianMode && qmdResult) && (
        <>
          {/* Type Filter */}
          <div className="mb-6">
            <h3 className="mb-3">筆記類型</h3>
            <div className="flex flex-wrap gap-2">
              {(['fleet', 'source', 'permanent'] as Note['type'][]).map(type => (
                <Badge
                  key={type}
                  variant={selectedTypes.includes(type) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => toggleType(type)}
                >
                  {getTypeLabel(type)}
                  {selectedTypes.includes(type) && <X className="ml-1 size-3" />}
                </Badge>
              ))}
            </div>
          </div>

          {/* Tags Filter */}
          {allTags.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3">標籤篩選</h3>
              <div className="flex flex-wrap gap-2">
                {allTags.map(tag => (
                  <Badge
                    key={tag}
                    variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleTag(tag)}
                  >
                    #{tag}
                    {selectedTags.includes(tag) && <X className="ml-1 size-3" />}
                  </Badge>
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

          {/* Notes Grid — same style as PermanentNotes */}
          {filteredNotes.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 select-none">
              {filteredNotes.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(note => {
                const isSelected = selectedNotes.has(note.id);
                const preview = note.content
                  .replace(/^---\s*\n[\s\S]*?\n---\s*\n*/, '')
                  .replace(/^#{1,6}\s+/gm, '')
                  .replace(/\*\*|__|\*|_|~~|`/g, '')
                  .replace(/^[-*+]\s+/gm, '')
                  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                  .trim()
                  .substring(0, 300);
                const noteTags = note.tags || [];

                return (
                  <div
                    key={note.id}
                    ref={(el) => {
                      if (el) cardRefs.current.set(note.id, el);
                      else cardRefs.current.delete(note.id);
                    }}
                  >
                    <Card
                      data-note-card
                      className={`p-4 cursor-pointer hover:shadow-lg transition-all bg-white h-64 flex flex-col relative ${
                        isSelected ? 'ring-2 ring-blue-500 shadow-lg' : ''
                      }`}
                      onClick={(event) => handleNoteClick(note, event)}
                      onContextMenu={(event) => handleContextMenu(event, note)}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
                          ✓
                        </div>
                      )}
                      <h3 className="font-bold mb-2 text-[18px] line-clamp-1">{note.title}</h3>
                      {noteTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {noteTags.map(tag => (
                            <Badge key={tag} variant="secondary" className="text-xs">#{tag}</Badge>
                          ))}
                        </div>
                      )}
                      <div className="text-sm text-gray-600 overflow-hidden flex-1">
                        <p className="text-[12px] leading-normal line-clamp-6 whitespace-pre-line">{preview}</p>
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          )}

          {filteredNotes.length === 0 && !loading && (
            <div className="text-center py-12 text-gray-500">
              {searchTerm || selectedTags.length > 0 || selectedTypes.length > 0
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
