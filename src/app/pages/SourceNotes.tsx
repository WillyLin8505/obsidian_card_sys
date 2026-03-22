import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { storage } from '../utils/storage';
import { Note } from '../types/note';
import { NoteCard } from '../components/NoteCard';
import { Plus, ExternalLink, ArrowLeft, Save, Trash2, Link2, Tag as TagIcon } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import { useDragSelect } from '../hooks/useDragSelect';

export function SourceNotes() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewNoteDialog, setShowNewNoteDialog] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteUrl, setNewNoteUrl] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');

  // For viewing a specific note
  const [viewingNote, setViewingNote] = useState<Note | null>(null);
  const [linkedNotes, setLinkedNotes] = useState<Note[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [newTag, setNewTag] = useState('');

  // 拖曳選取狀態
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  // 使用拖曳選取hook
  const { isSelecting, selectionBox, isInSelectionBox, getSelectionBoxStyle, shouldClearSelection } = useDragSelect(containerRef);

  useEffect(() => {
    loadNotes();
  }, []);

  useEffect(() => {
    const loadNote = async () => {
      if (id) {
        const note = await storage.getNoteById(id);
        if (note && note.type === 'source') {
          setViewingNote(note);
          setEditTitle(note.title);
          setEditContent(note.content);
          setEditUrl(note.sourceUrl || '');
          
          // Load linked notes
          const linked: Note[] = [];
          for (const linkId of note.links) {
            const linkedNote = await storage.getNoteById(linkId);
            if (linkedNote) {
              linked.push(linkedNote);
            }
          }
          setLinkedNotes(linked);
        }
      } else {
        setViewingNote(null);
        setLinkedNotes([]);
      }
    };
    loadNote();
  }, [id]);

  const loadNotes = async () => {
    try {
      setLoading(true);
      const allNotes = await storage.getNotes();
      const sourceNotes = allNotes.filter(n => n.type === 'source');
      setNotes(sourceNotes.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ));
    } catch (error) {
      console.error('Error loading source notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const createNewNote = async () => {
    if (!newNoteTitle.trim()) return;

    const config = storage.getConfig();
    const currentDate = new Date().toISOString().split('T')[0];
    
    // 建立帶有 frontmatter 的模板
    const frontmatter = `---
create date: ${currentDate}
aliases:
tags:
---

`;
    
    const newNote: Note = {
      id: '', // Temporary ID, will be replaced by server
      title: newNoteTitle,
      content: frontmatter + (newNoteContent || config.sourceNoteTemplate || ''),
      type: 'source',
      tags: [],
      links: [],
      sourceUrl: newNoteUrl || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    try {
      await storage.addNote(newNote);
      setShowNewNoteDialog(false);
      setNewNoteTitle('');
      setNewNoteUrl('');
      setNewNoteContent('');
      await loadNotes();
      toast.success('文獻筆記已建立');
    } catch (error) {
      console.error('Failed to create note:', error);
      toast.error('創建筆記失敗');
    }
  };

  const handleSave = async () => {
    if (!viewingNote) return;
    
    await storage.updateNote(viewingNote.id, {
      title: editTitle,
      content: editContent,
      sourceUrl: editUrl || undefined,
    });
    
    const updatedNote = await storage.getNoteById(viewingNote.id);
    if (updatedNote) {
      setViewingNote(updatedNote);
    }
    setIsEditing(false);
    await loadNotes();
  };

  const handleDelete = async () => {
    if (!viewingNote || !confirm('確定要刪除這則文獻筆記嗎？')) return;
    
    await storage.deleteNote(viewingNote.id);
    navigate('/source-notes');
    await loadNotes();
  };

  const handleAddTag = async () => {
    if (!viewingNote || !newTag.trim()) return;
    
    if (!viewingNote.tags.includes(newTag.trim())) {
      const updatedTags = [...viewingNote.tags, newTag.trim()];
      await storage.updateNote(viewingNote.id, { tags: updatedTags });
      
      const updatedNote = await storage.getNoteById(viewingNote.id);
      if (updatedNote) {
        setViewingNote(updatedNote);
      }
      setNewTag('');
      await loadNotes();
    }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!viewingNote) return;
    
    const updatedTags = viewingNote.tags.filter(t => t !== tag);
    await storage.updateNote(viewingNote.id, { tags: updatedTags });
    
    const updatedNote = await storage.getNoteById(viewingNote.id);
    if (updatedNote) {
      setViewingNote(updatedNote);
    }
    await loadNotes();
  };

  const getLinkedNote = async (linkId: string) => {
    return await storage.getNoteById(linkId);
  };

  // 處理筆記點擊（支援多選）
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

    // 一般點擊 = 導航
    navigate(`/source-notes/${note.id}`);
  };

  // 右鍵選單處理
  const handleContextMenu = (event: React.MouseEvent, note: Note) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (!selectedNotes.has(note.id)) {
      setSelectedNotes(new Set([note.id]));
    }
    
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  // 刪除選中的筆記
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
        Array.from(selectedNotes).map(id => storage.deleteNote(id))
      );
      
      toast.success(`已刪除 ${selectedNotes.size} 則筆記`);
      setSelectedNotes(new Set());
      setContextMenu(null);
      await loadNotes();
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

    if (shouldClearSelection) {
      setSelectedNotes(new Set());
    }
  }, [isSelecting, selectionBox, isInSelectionBox, shouldClearSelection]);

  // If viewing a specific note
  if (viewingNote) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/source-notes')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="size-4" />
            返回列表
          </Button>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => navigate('/permanent-notes', { state: { linkingNoteId: viewingNote.id } })}
              className="flex items-center gap-2"
            >
              <Link2 className="size-4" />
              連結筆記
            </Button>
            
            {isEditing ? (
              <Button onClick={handleSave} className="flex items-center gap-2">
                <Save className="size-4" />
                儲存
              </Button>
            ) : (
              <Button onClick={() => setIsEditing(true)}>
                編輯
              </Button>
            )}
            
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="flex items-center gap-2"
            >
              <Trash2 className="size-4" />
              刪除
            </Button>
          </div>
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-2">標題</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="輸入標題"
              />
            </div>
            
            <div>
              <label className="block text-sm mb-2">來源網址</label>
              <Input
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="輸入來源網址（選填）"
                type="url"
              />
            </div>
            
            <div>
              <label className="block text-sm mb-2">內容</label>
              <Tabs defaultValue="edit" className="w-full">
                <TabsList>
                  <TabsTrigger value="edit">編輯</TabsTrigger>
                  <TabsTrigger value="preview">預覽</TabsTrigger>
                </TabsList>
                <TabsContent value="edit">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="輸入筆記內容（支援 Markdown）"
                    rows={20}
                    className="font-mono"
                  />
                </TabsContent>
                <TabsContent value="preview">
                  <div className="border rounded-lg p-4 min-h-[500px] prose max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {editContent}
                    </ReactMarkdown>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between mb-4">
              <h1 className="flex-1">{viewingNote.title}</h1>
              {viewingNote.sourceUrl && (
                <a
                  href={viewingNote.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm"
                >
                  <ExternalLink className="size-4" />
                  查看來源
                </a>
              )}
            </div>
            
            <div className="prose max-w-none bg-white border rounded-lg p-6 mb-6">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {viewingNote.content}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* Tags Section */}
        <div className="mt-6">
          <h3 className="mb-3 flex items-center gap-2">
            <TagIcon className="size-5" />
            標籤
          </h3>
          
          <div className="flex flex-wrap gap-2 mb-3">
            {viewingNote.tags.map(tag => (
              <Badge
                key={tag}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => handleRemoveTag(tag)}
              >
                #{tag} ×
              </Badge>
            ))}
          </div>
          
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
              placeholder="新增標籤"
              className="max-w-xs"
            />
            <Button onClick={handleAddTag} variant="outline">
              新增
            </Button>
          </div>
        </div>

        {/* Linked Notes Section */}
        {viewingNote.links.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-3">連結的筆記</h3>
            <div className="space-y-2">
              {linkedNotes.map(linkedNote => {
                return linkedNote ? (
                  <div
                    key={linkedNote.id}
                    className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      if (linkedNote.type === 'fleet') {
                        navigate(`/fleet-notes/${linkedNote.id}`);
                      } else if (linkedNote.type === 'source') {
                        navigate(`/source-notes/${linkedNote.id}`);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Link2 className="size-4 text-gray-400" />
                      <span>{linkedNote.title}</span>
                    </div>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div 
      className="p-6" 
      ref={containerRef}
      style={{ userSelect: isSelecting ? 'none' : 'auto' }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="mb-2">文獻筆記</h1>
          <p className="text-gray-600">管理您的參考文獻和資料來源</p>
          {selectedNotes.size > 0 && (
            <p className="text-sm text-blue-600 mt-2">
              已選取 {selectedNotes.size} 則筆記 - 右鍵點擊以顯示操作選單
            </p>
          )}
        </div>
        <Button onClick={() => setShowNewNoteDialog(true)} className="flex items-center gap-2">
          <Plus className="size-5" />
          新增文獻
        </Button>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 select-none"
        style={{ userSelect: 'none' }}
      >
        {notes.map(note => {
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
              className={`relative ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs z-10">
                  ✓
                </div>
              )}
              <NoteCard
                note={note}
                onClick={(e) => handleNoteClick(note, e)}
                onLinkClick={() => navigate('/permanent-notes', { state: { linkingNoteId: note.id } })}
                onContextMenu={(e) => handleContextMenu(e, note)}
              />
              {note.sourceUrl && (
                <a
                  href={note.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute top-2 right-8 p-2 bg-white rounded-full shadow-sm hover:shadow-md transition-shadow"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="size-4 text-blue-600" />
                </a>
              )}
            </div>
          );
        })}
      </div>

      {/* 拖曳框 */}
      {isSelecting && getSelectionBoxStyle() && (
        <div style={getSelectionBoxStyle()!} />
      )}

      {notes.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          尚無文獻筆記，點擊右上角的按鈕創建第一則文獻筆記
        </div>
      )}

      {/* New Note Dialog */}
      <Dialog open={showNewNoteDialog} onOpenChange={setShowNewNoteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增文獻筆記</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-2">標題 *</label>
              <Input
                value={newNoteTitle}
                onChange={(e) => setNewNoteTitle(e.target.value)}
                placeholder="輸入文獻標題"
              />
            </div>
            <div>
              <label className="block text-sm mb-2">來源網址</label>
              <Input
                value={newNoteUrl}
                onChange={(e) => setNewNoteUrl(e.target.value)}
                placeholder="輸入來源網址（選填）"
                type="url"
              />
            </div>
            <div>
              <label className="block text-sm mb-2">初始內容</label>
              <Textarea
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                placeholder="輸入初始內容（選填）"
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewNoteDialog(false)}>
                取消
              </Button>
              <Button onClick={createNewNote} disabled={!newNoteTitle.trim()}>
                創建
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Context Menu */}
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
    </div>
  );
}