import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../utils/api';
import { Note } from '../types/note';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Tag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDragSelect } from '../hooks/useDragSelect';

export function PermanentNotes() {
  const navigate = useNavigate();
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [filteredNotes, setFilteredNotes] = useState<Note[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  // 使用拖曳選取hook
  const { isSelecting, selectionBox, isInSelectionBox, getSelectionBoxStyle } = useDragSelect(containerRef);

  // 解析 Markdown 去除 frontmatter
  const removeFrontmatter = (content: string): string => {
    // 移除 YAML frontmatter (--- 開頭和結尾)
    const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n*/;
    return content.replace(frontmatterRegex, '').trim();
  };

  // 提取標籤
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

  // 獲取內容預覽
  const getContentPreview = (content: string, maxLength: number = 200): string => {
    const cleaned = removeFrontmatter(content);
    return cleaned.length > maxLength 
      ? cleaned.substring(0, maxLength) + '...' 
      : cleaned;
  };

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      setLoading(true);
      const notes = await api.notes.getAll();
      const sorted = [...notes].sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      setAllNotes(sorted);
      setFilteredNotes(sorted);

      // 收集所有標籤
      const tagsSet = new Set<string>();
      notes.forEach(note => {
        const noteTags = extractTags(note);
        noteTags.forEach(tag => tagsSet.add(tag));
      });
      setAllTags(Array.from(tagsSet).sort());
    } catch (error: any) {
      console.error('Error loading notes:', error);
      toast.error(`載入失敗: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 根據選中的標籤篩選筆記
    if (selectedTags.length === 0) {
      setFilteredNotes(allNotes);
    } else {
      const filtered = allNotes.filter(note => {
        const noteTags = extractTags(note);
        return selectedTags.some(tag => noteTags.includes(tag));
      });
      setFilteredNotes(filtered);
    }
  }, [selectedTags, allNotes]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const handleNoteClick = (note: Note, event: React.MouseEvent) => {
    // Ctrl/Cmd + 點擊 = 多選
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

    // 一般點擊 = 導航到編輯頁面
    if (note.type === 'fleet') {
      navigate(`/fleet-notes/${note.id}`);
    } else if (note.type === 'source') {
      navigate(`/source-notes/${note.id}`);
    } else if (note.type === 'permanent') {
      navigate(`/permanent-notes/${note.id}`);
    } else {
      navigate(`/permanent-notes/${note.id}`);
    }
  };

  const handleContextMenu = (event: React.MouseEvent, note: Note) => {
    event.preventDefault();
    event.stopPropagation();
    
    // 如果右鍵的筆記不在選中列表中，將其加入
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
      await Promise.all(
        Array.from(selectedNotes).map(id => api.notes.delete(id))
      );
      
      toast.success(`已刪除 ${selectedNotes.size} 則筆記`);
      setSelectedNotes(new Set());
      setContextMenu(null);
      loadNotes();
    } catch (error: any) {
      console.error('Error deleting notes:', error);
      toast.error(`刪除失敗: ${error.message}`);
    }
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // 點擊任意地方關閉右鍵選單
  useEffect(() => {
    const handleClick = () => closeContextMenu();
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  // 拖曳選取時更新選中的筆記
  useEffect(() => {
    if (isSelecting && selectionBox) {
      const selected = new Set<string>();
      cardRefs.current.forEach((element, noteId) => {
        if (isInSelectionBox(element)) {
          selected.add(noteId);
        }
      });
      setSelectedNotes(selected);
    }
  }, [isSelecting, selectionBox, isInSelectionBox]);

  // 直接在容器上處理拖曳
  const handleContainerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 只處理左鍵
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    
    // 如果點擊在卡片上，不處理
    if (target.closest('[data-note-card]')) {
      return;
    }

    setDebugInfo('按下鼠標！位置: ' + e.clientX + ', ' + e.clientY);
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragEnd({ x: e.clientX, y: e.clientY });
  };

  const handleContainerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging && dragStart) {
      setDragEnd({ x: e.clientX, y: e.clientY });
      setDebugInfo('拖曳中... ' + e.clientX + ', ' + e.clientY);
      
      // 即時計算選中的筆記
      const box = {
        left: Math.min(dragStart.x, e.clientX),
        right: Math.max(dragStart.x, e.clientX),
        top: Math.min(dragStart.y, e.clientY),
        bottom: Math.max(dragStart.y, e.clientY),
      };

      const selected = new Set<string>();
      cardRefs.current.forEach((element, noteId) => {
        const rect = element.getBoundingClientRect();
        
        // 檢查是否相交
        const isIntersecting = !(
          rect.right < box.left ||
          rect.left > box.right ||
          rect.bottom < box.top ||
          rect.top > box.bottom
        );
        
        if (isIntersecting) {
          selected.add(noteId);
        }
      });
      
      setSelectedNotes(selected);
    }
  };

  const handleContainerMouseUp = () => {
    if (isDragging) {
      console.log('=== 開始選取 ===');
      setDebugInfo('鼠標釋放！');
      setIsDragging(false);
      
      // 首先檢查 cardRefs
      console.log('cardRefs.current.size:', cardRefs.current.size);
      console.log('cardRefs keys:', Array.from(cardRefs.current.keys()));
      console.log('filteredNotes.length:', filteredNotes.length);
      
      // 計算選中的筆記
      if (dragStart && dragEnd) {
        const box = {
          left: Math.min(dragStart.x, dragEnd.x),
          right: Math.max(dragStart.x, dragEnd.x),
          top: Math.min(dragStart.y, dragEnd.y),
          bottom: Math.max(dragStart.y, dragEnd.y),
        };

        console.log('選取框:', box);
        console.log('卡片總數:', cardRefs.current.size);

        const selected = new Set<string>();
        cardRefs.current.forEach((element, noteId) => {
          const rect = element.getBoundingClientRect();
          console.log(`檢查卡片 ${noteId}:`, rect);
          
          // 檢查是否相交
          const isIntersecting = !(
            rect.right < box.left ||
            rect.left > box.right ||
            rect.bottom < box.top ||
            rect.top > box.bottom
          );
          
          console.log(`  相交: ${isIntersecting}`);
          
          if (isIntersecting) {
            selected.add(noteId);
          }
        });
        
        console.log('選中的筆記:', selected);
        console.log('選中數量:', selected.size);
        setSelectedNotes(selected);
      }
      
      setTimeout(() => {
        setDragStart(null);
        setDragEnd(null);
      }, 100);
    }
  };

  // 獲取拖曳框樣式
  const getDragBoxStyle = (): React.CSSProperties | null => {
    if (!isDragging || !dragStart || !dragEnd) return null;

    const left = Math.min(dragStart.x, dragEnd.x);
    const top = Math.min(dragStart.y, dragEnd.y);
    const width = Math.abs(dragEnd.x - dragStart.x);
    const height = Math.abs(dragEnd.y - dragStart.y);

    return {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      border: '2px dashed #3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      pointerEvents: 'none',
      zIndex: 9999,
    };
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12 text-gray-500">載入中...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden">
      {/* 左側標籤篩選欄 */}
      <div className="w-64 border-r bg-gray-50 overflow-y-auto flex-shrink-0">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="size-5 text-gray-700" />
            <h2 className="text-lg font-semibold">標籤篩選</h2>
          </div>
          
          <div className="space-y-1">
            {allTags.length > 0 ? (
              allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-purple-100 text-purple-700 font-medium'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  #{tag}
                </button>
              ))
            ) : (
              <p className="text-sm text-gray-500 py-2">尚無標籤</p>
            )}
          </div>

          {selectedTags.length > 0 && (
            <button
              onClick={() => setSelectedTags([])}
              className="mt-4 w-full px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              清除篩選
            </button>
          )}
        </div>
      </div>

      {/* 右側筆記卡片區域 */}
      <div 
        ref={containerRef} 
        className="flex-1 overflow-y-auto bg-gray-100 select-none"
        style={{ userSelect: 'none' }}
        onMouseDown={handleContainerMouseDown}
        onMouseMove={handleContainerMouseMove}
        onMouseUp={handleContainerMouseUp}
      >
        <div className="p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">永久筆記</h1>
            <p className="text-gray-600">
              {selectedTags.length > 0
                ? `篩選標籤: ${selectedTags.map(t => '#' + t).join(', ')} - 找到 ${filteredNotes.length} 則筆記`
                : `共 ${filteredNotes.length} 則筆記`}
            </p>
            {selectedNotes.size > 0 && (
              <p className="text-sm text-blue-600 mt-2">
                已選取 {selectedNotes.size} 則筆記 - 右鍵點擊以顯示操作選單
              </p>
            )}
            {selectedNotes.size === 0 && (
              <p className="text-sm text-gray-500 mt-2">
                提示：按住 Ctrl/Cmd + 點擊可多選筆記，或在空白處拖曳框選
              </p>
            )}
            {isSelecting && (
              <p className="text-sm text-green-600 mt-2 font-bold">
                🎯 正在拖曳選取中...
              </p>
            )}
          </div>

          {filteredNotes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredNotes.map(note => {
                const noteTags = extractTags(note);
                const preview = getContentPreview(note.content);
                const isSelected = selectedNotes.has(note.id);

                return (
                  <div
                    key={note.id}
                    ref={(el) => {
                      if (el) {
                        cardRefs.current.set(note.id, el);
                      } else {
                        cardRefs.current.delete(note.id);
                      }
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
                        <div className="flex flex-wrap gap-1">
                          {noteTags.map(tag => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className={`text-xs ${
                                selectedTags.includes(tag)
                                  ? 'bg-purple-100 text-purple-700'
                                  : ''
                              }`}
                            >
                              #{tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="text-sm text-gray-600 overflow-hidden flex-1">
                        <div className="line-clamp-6 [&_p]:!text-[12px] [&_p]:!font-normal [&_p]:!leading-normal [&_h1]:!text-[16px] [&_h1]:!font-bold [&_h2]:!text-[14px] [&_h2]:!font-bold [&_h3]:!text-[13px] [&_h3]:!font-semibold [&_li]:!text-[12px] [&_li]:!font-normal">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {preview}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>沒有符合條件的筆記</p>
              {selectedTags.length > 0 && (
                <button
                  onClick={() => setSelectedTags([])}
                  className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 underline"
                >
                  清除篩選
                </button>
              )}
            </div>
          )}
        </div>
      </div>

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

      {/* 拖曳選取框 */}
      {isSelecting && getSelectionBoxStyle() && (
        <div style={getSelectionBoxStyle()!} />
      )}

      {/* 拖曳框 */}
      {isDragging && getDragBoxStyle() && (
        <div style={getDragBoxStyle()!} />
      )}
    </div>
  );
}