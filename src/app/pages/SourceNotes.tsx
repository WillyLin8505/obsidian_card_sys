import { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import { useNavigate, useParams } from 'react-router';
import { storage, sortByRecentActivity } from '../utils/storage';
import { getCardFontSizes } from '../utils/noteCardSizes';
import { Note } from '../types/note';
import { NoteCard } from '../components/NoteCard';
import { ExternalLink, ArrowLeft, Trash2, Link2, Tag as TagIcon, Loader2, Copy, CheckCircle2, Circle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { localApi } from '../utils/api';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { useDragSelect } from '../hooks/useDragSelect';
import { buildNoteContent } from '../utils/buildNoteContent';
import { parseFrontmatterValue } from '../utils/frontmatter';

const LOCAL_SRC_KEY = 'zettelkasten_local_source_notes';
const READ_IDS_KEY = 'zettelkasten_source_read_ids';
const READING_SUMMARY_SOURCE_TAG_CLEANUP_KEY = 'source_notes_cleanup_reading_summary_tag_20260517';

function getFrontmatterTags(content: string): string[] {
  return parseFrontmatterValue(content, 'tags')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

function withFrontmatterTags(note: Note): Note {
  return {
    ...note,
    tags: [...new Set([...(note.tags || []), ...getFrontmatterTags(note.content)])],
  };
}

function isSourceNote(note: Note): boolean {
  return note.type === 'source' && note.tags.some(tag => tag.includes('文獻筆記'));
}

function isReadingSummaryDashTitle(title: string): boolean {
  return /^閱讀整理\s*[-－–—]/.test(title.trim());
}

function withoutSourceNoteTag(tags: string[]): string[] {
  return tags.filter(tag => !tag.includes('文獻筆記'));
}

function writeFrontmatterTags(content: string, tags: string[]): string {
  const normalizedTags = [...new Set(tags.map(tag => tag.trim()).filter(Boolean))];
  const tagsBlock = normalizedTags.length > 0
    ? `tags:\n${normalizedTags.map(tag => `  - ${tag}`).join('\n')}`
    : '';
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);

  if (!frontmatterMatch) {
    return tagsBlock ? `---\n${tagsBlock}\n---\n\n${content}` : content;
  }

  const rawFrontmatter = frontmatterMatch[1];
  const body = content.slice(frontmatterMatch[0].length);
  const lines = rawFrontmatter.split('\n');
  const nextLines: string[] = [];
  let replaced = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const keyMatch = line.match(/^([^:]+):/);

    if (keyMatch && keyMatch[1].trim() === 'tags') {
      replaced = true;
      while (i + 1 < lines.length && lines[i + 1].startsWith('  - ')) i++;
      if (tagsBlock) nextLines.push(tagsBlock);
      continue;
    }

    nextLines.push(line);
  }

  if (!replaced && tagsBlock) nextLines.push(tagsBlock);

  return `---\n${nextLines.filter(line => line.trim() !== '').join('\n')}\n---\n\n${body}`;
}

function getLocalSourceNotes(): Note[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_SRC_KEY) || '[]'); } catch { return []; }
}
function saveLocalSourceNote(note: Note): void {
  const existing = getLocalSourceNotes().filter(n => n.id !== note.id);
  localStorage.setItem(LOCAL_SRC_KEY, JSON.stringify([...existing, note]));
}
function deleteLocalSourceNote(id: string): void {
  localStorage.setItem(LOCAL_SRC_KEY, JSON.stringify(getLocalSourceNotes().filter(n => n.id !== id)));
}
function loadReadIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(READ_IDS_KEY) || '[]')); } catch { return new Set(); }
}
function persistReadIds(ids: Set<string>): void {
  localStorage.setItem(READ_IDS_KEY, JSON.stringify([...ids]));
}

export function SourceNotes() {
  const navigate = useNavigate();
  const { id: rawId } = useParams<{ id: string }>();
  const id = rawId ? decodeURIComponent(rawId) : undefined;
  const [notes, setNotes] = useState<Note[]>(() =>
    sortByRecentActivity(getLocalSourceNotes())
  );
  const [urlInput, setUrlInput] = useState('');
  const [fetchingCount, setFetchingCount] = useState(0);

  // For viewing a specific note
  const [viewingNote, setViewingNote] = useState<Note | null>(null);
  const [linkedNotes, setLinkedNotes] = useState<Note[]>([]);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const deferredEditContent = useDeferredValue(editContent);
  const [editUrl, setEditUrl] = useState('');
  const sourceEditContentRef = useRef('');
  const lastSavedSnapshotRef = useRef('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const syncingScrollRef = useRef(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved');
  const [newTag, setNewTag] = useState('');
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const tagInputRef = useRef<HTMLDivElement>(null);
  const [allTagPool, setAllTagPool] = useState<string[]>(() => {
    const config = storage.getConfig();
    return config.sourceNoteTags || [];
  });

  // 非同步掃描所有筆記的 tags，建立完整標籤池
  useEffect(() => {
    storage.getNotes().then(allNotes => {
      const config = storage.getConfig();
      const fromConfig = config.sourceNoteTags || [];
      const fromNotes = allNotes.map(withFrontmatterTags).flatMap(n => n.tags ?? []);
      setAllTagPool([...new Set([...fromConfig, ...fromNotes])].sort());
    }).catch(() => {});
  }, []);

  const filteredTagOptions = useMemo(() => {
    const q = newTag.trim().toLowerCase();
    return allTagPool.filter(t =>
      !viewingNote?.tags.includes(t) && (q === '' || t.toLowerCase().includes(q))
    );
  }, [allTagPool, newTag, viewingNote]);

  const closeTagDropdown = () => setShowTagDropdown(false);

  // 已讀狀態與篩選
  const [readNoteIds, setReadNoteIds] = useState<Set<string>>(() => loadReadIds());
  const [filterMode, setFilterMode] = useState<'all' | 'unread' | 'read'>('all');

  const toggleRead = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setReadNoteIds(prev => {
      const next = new Set(prev);
      if (next.has(noteId)) { next.delete(noteId); } else { next.add(noteId); }
      persistReadIds(next);
      return next;
    });
  };

  const filteredNotes = useMemo(() => {
    if (filterMode === 'read') return notes.filter(n => readNoteIds.has(n.id));
    if (filterMode === 'unread') return notes.filter(n => !readNoteIds.has(n.id));
    return notes;
  }, [notes, readNoteIds, filterMode]);

  // 拖曳選取狀態
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const isMountedRef = useRef(true);
  useEffect(() => { return () => { isMountedRef.current = false; }; }, []);

  // 使用拖曳選取hook
  const { isSelecting, selectionBox, isInSelectionBox, getSelectionBoxStyle, shouldClearSelection } = useDragSelect(containerRef);

  const cardSizes = useMemo(() => getCardFontSizes(storage.getConfig()), []);

  useEffect(() => {
    loadNotes();
  }, []);

  useEffect(() => {
    const cleanupReadingSummarySourceTags = async () => {
      if (localStorage.getItem(READING_SUMMARY_SOURCE_TAG_CLEANUP_KEY) === 'done') return;

      try {
        const notesById = new Map<string, Note>();
        (await storage.getNotes()).forEach(note => notesById.set(note.id, note));
        getLocalSourceNotes().forEach(note => notesById.set(note.id, note));

        const targets = Array.from(notesById.values())
          .map(withFrontmatterTags)
          .filter(note =>
            note.type === 'source' &&
            isReadingSummaryDashTitle(note.title) &&
            note.tags.some(tag => tag.includes('文獻筆記'))
          );

        if (targets.length === 0) {
          localStorage.setItem(READING_SUMMARY_SOURCE_TAG_CLEANUP_KEY, 'done');
          return;
        }

        for (const note of targets) {
          const nextTags = withoutSourceNoteTag(note.tags);
          const nextContent = writeFrontmatterTags(note.content, nextTags);
          const updatedAt = new Date().toISOString();
          const localNote = getLocalSourceNotes().find(n => n.id === note.id);
          saveLocalSourceNote({
            ...(localNote ?? note),
            content: nextContent,
            tags: nextTags,
            updatedAt,
          });
          await storage.updateNote(note.id, {
            content: nextContent,
            tags: nextTags,
            updatedAt,
          });
        }

        localStorage.setItem(READING_SUMMARY_SOURCE_TAG_CLEANUP_KEY, 'done');
        toast.success(`已移除 ${targets.length} 則「閱讀整理-」筆記的文獻筆記標籤`);
        await loadNotes();
      } catch (error) {
        console.error('Failed to clean reading summary source tags:', error);
        toast.error('批次移除「閱讀整理-」文獻筆記標籤失敗');
      }
    };

    cleanupReadingSummarySourceTags();
  }, []);

  useEffect(() => {
    const loadNote = async () => {
      if (id) {
        let note: Note | undefined;
        try { note = await storage.getNoteById(id); } catch { /* ignore */ }
        // Fall back to locally-saved source notes
        if (!note || note.type !== 'source') {
          note = getLocalSourceNotes().find(n => n.id === id);
        }
        if (note && note.type === 'source') {
          const noteWithTags = withFrontmatterTags(note);

          storage.recordOpened(noteWithTags.id);
          setViewingNote(noteWithTags);
          setEditTitle(noteWithTags.title);
          setEditContent(noteWithTags.content);
          sourceEditContentRef.current = noteWithTags.content;
          setEditUrl(noteWithTags.sourceUrl || '');
          lastSavedSnapshotRef.current = JSON.stringify({
            title: noteWithTags.title,
            content: noteWithTags.content,
            sourceUrl: noteWithTags.sourceUrl || '',
          });
          setAutoSaveStatus('saved');

          // Load linked notes
          const linked: Note[] = [];
          for (const linkId of noteWithTags.links) {
            let linkedNote: Note | undefined;
            try { linkedNote = await storage.getNoteById(linkId); } catch { /* ignore */ }
            if (linkedNote) linked.push(linkedNote);
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

  useEffect(() => {
    if (!viewingNote) return;

    const content = editContent;
    const snapshot = JSON.stringify({
      title: editTitle,
      content,
      sourceUrl: editUrl || '',
    });

    if (snapshot === lastSavedSnapshotRef.current) {
      setAutoSaveStatus('saved');
      return;
    }

    setAutoSaveStatus('pending');
    const timer = window.setTimeout(async () => {
      const contentTags = getFrontmatterTags(content);
      const updates = {
        title: editTitle,
        content,
        sourceUrl: editUrl || undefined,
        tags: contentTags,
        updatedAt: new Date().toISOString(),
      };

      setAutoSaveStatus('saving');

      const localNote = getLocalSourceNotes().find(n => n.id === viewingNote.id);
      const baseNote = localNote ?? viewingNote;
      const updatedNote = withFrontmatterTags({ ...baseNote, ...updates });
      saveLocalSourceNote(updatedNote);

      try {
        await storage.updateNote(viewingNote.id, updates);
        lastSavedSnapshotRef.current = snapshot;
        setViewingNote(prev => prev && prev.id === viewingNote.id
          ? withFrontmatterTags({ ...prev, ...updates })
          : prev
        );
        setNotes(prev => sortByRecentActivity(
          prev
            .map(note => note.id === viewingNote.id ? withFrontmatterTags({ ...note, ...updates }) : note)
            .filter(isSourceNote)
        ));
        setAutoSaveStatus('saved');
      } catch {
        lastSavedSnapshotRef.current = snapshot;
        setViewingNote(prev => prev && prev.id === viewingNote.id ? updatedNote : prev);
        setNotes(prev => sortByRecentActivity(
          prev
            .map(note => note.id === viewingNote.id ? updatedNote : note)
            .filter(isSourceNote)
        ));
        setAutoSaveStatus('saved');
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [viewingNote?.id, editTitle, editUrl, editContent]);

  const loadNotes = async () => {
    try {
      let sourceNotes: Note[] = [];
      try {
        const allNotes = await storage.getNotes();
        sourceNotes = allNotes
          .filter(n => n.type === 'source')
          .map(withFrontmatterTags);
      } catch (err) {
        console.error('Error loading from storage:', err);
      }
      const mergedById = new Map<string, Note>();
      sourceNotes.forEach(note => mergedById.set(note.id, note));

      for (const localNote of getLocalSourceNotes().map(withFrontmatterTags)) {
        for (const [id, note] of mergedById) {
          if (localNote.sourceUrl && note.sourceUrl === localNote.sourceUrl && id !== localNote.id) {
            mergedById.delete(id);
          }
        }
        mergedById.set(localNote.id, localNote);
      }

      const merged = Array.from(mergedById.values()).filter(isSourceNote);
      setNotes(sortByRecentActivity(merged));
    } catch (error) {
      console.error('Error loading source notes:', error);
    }
  };

  const handleUrlSubmit = async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      toast.error('請輸入有效的網址（以 http:// 或 https:// 開頭）');
      return;
    }

    setFetchingCount(c => c + 1);
    setUrlInput('');
    toast.info('正在抓取並分析文章，請稍候...');

    try {
      const config = storage.getConfig();
      const template = config.sourceNoteTemplate;
      const templateBody = template?.bodyTemplate;
      const { title, content } = await localApi.fetchUrl(parsedUrl.toString(), templateBody);

      // Prepend YAML frontmatter from metadataFields, filling create date with today
      const today = new Date().toISOString().split('T')[0];
      const fieldsWithDate = (template?.metadataFields ?? []).map(f =>
        f.key === 'create date' ? { ...f, defaultValue: today } : f
      );
      const frontmatter = fieldsWithDate.length > 0
        ? buildNoteContent({ metadataFields: fieldsWithDate, bodyTemplate: '' })
        : '';
      const fullContent = frontmatter + content;
      const contentTags = getFrontmatterTags(fullContent);

      const noteId = crypto.randomUUID();
      const newNote: Note = {
        id: noteId,
        title: title || parsedUrl.hostname,
        content: fullContent,
        type: 'source',
        tags: contentTags,
        links: [],
        sourceUrl: parsedUrl.toString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Save locally first — guaranteed to work
      saveLocalSourceNote(newNote);

      // Try configured storage in background (Supabase/obsidian)
      storage.addNote(newNote).then(created => {
        // If Supabase returns a different ID, update the local record
        if (created?.id && created.id !== noteId) {
          deleteLocalSourceNote(noteId);
          saveLocalSourceNote(created);
          // Migrate read status: old local UUID → new backend ID
          setReadNoteIds(prev => {
            if (!prev.has(noteId)) return prev;
            const next = new Set(prev);
            next.delete(noteId);
            next.add(created.id);
            persistReadIds(next);
            return next;
          });
          if (isMountedRef.current) loadNotes();
        }
      }).catch(err => {
        console.warn('[SourceNotes] Background sync failed, note saved locally:', err.message);
      });

      // Save to sourceNoteSavePath if configured
      const saveDir = config.sourceNoteSavePath?.trim();
      if (saveDir) {
        const safeTitle = (newNote.title || 'note').replace(/[/\\?%*:|"<>]/g, '-');
        const filename = `${safeTitle}-${Date.now()}.md`;
        localApi.createNote(saveDir, filename, fullContent).catch(err => {
          console.warn('[SourceNotes] Failed to save to sourceNoteSavePath:', err.message);
        });
      }

      if (isMountedRef.current) {
        await loadNotes();
        toast.success(`「${newNote.title}」已建立，點擊卡片可查看`, {
          action: {
            label: '開啟',
            onClick: () => navigate(`/source-notes/${encodeURIComponent(noteId)}`),
          },
        });
      } else {
        toast.success('文獻筆記已建立（前往「文獻筆記」查看）');
      }
    } catch (error: any) {
      console.error('Failed to fetch URL:', error);
      const msg = error.message || '';
      const isFetchFailed = msg === 'Failed to fetch' || msg.includes('fetch');
      toast.error(
        isFetchFailed && !msg.includes('抓取網頁')
          ? '無法連線至本地伺服器，請確認已執行 npm run dev（local-server/）'
          : msg || '無法分析該網址'
      );
    } finally {
      if (isMountedRef.current) setFetchingCount(c => c - 1);
    }
  };

  const handleDelete = async () => {
    if (!viewingNote || !confirm('確定要刪除這則文獻筆記嗎？')) return;

    deleteLocalSourceNote(viewingNote.id);
    try { await storage.deleteNote(viewingNote.id); } catch { /* local-only */ }
    navigate('/source-notes');
    await loadNotes();
  };

  const handleAddTag = async (tagOverride?: string) => {
    const tag = (tagOverride ?? newTag).trim();
    if (!viewingNote || !tag) return;

    if (!viewingNote.tags.includes(tag)) {
      const updatedTags = [...viewingNote.tags, tag];
      const currentContent = sourceEditContentRef.current || viewingNote.content;
      const updatedContent = writeFrontmatterTags(currentContent, updatedTags);

      // Optimistically update the UI immediately so the tag always shows
      setViewingNote(prev => prev ? { ...prev, tags: updatedTags, content: updatedContent } : prev);
      setEditContent(updatedContent);
      sourceEditContentRef.current = updatedContent;
      setNewTag('');

      const localNote = getLocalSourceNotes().find(n => n.id === viewingNote.id);
      const baseNote = localNote ?? viewingNote;
      saveLocalSourceNote({ ...baseNote, content: updatedContent, tags: updatedTags, updatedAt: new Date().toISOString() });

      try {
        await storage.updateNote(viewingNote.id, { content: updatedContent, tags: updatedTags });
      } catch {
        // Local cache already updated — UI remains consistent
      }
      await loadNotes();
    }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!viewingNote) return;

    const updatedTags = viewingNote.tags.filter(t => t !== tag);
    const currentContent = sourceEditContentRef.current || viewingNote.content;
    const updatedContent = writeFrontmatterTags(currentContent, updatedTags);

    setViewingNote(prev => prev ? { ...prev, tags: updatedTags, content: updatedContent } : prev);
    setEditContent(updatedContent);
    sourceEditContentRef.current = updatedContent;

    const localNote = getLocalSourceNotes().find(n => n.id === viewingNote.id);
    const baseNote = localNote ?? viewingNote;
    saveLocalSourceNote({ ...baseNote, content: updatedContent, tags: updatedTags, updatedAt: new Date().toISOString() });

    try {
      await storage.updateNote(viewingNote.id, { content: updatedContent, tags: updatedTags });
    } catch {
      // Local cache already updated — UI remains consistent
    }

    setNotes(prev => sortByRecentActivity(
      prev
        .map(note => note.id === viewingNote.id
          ? withFrontmatterTags({ ...note, content: updatedContent, tags: updatedTags })
          : note
        )
        .filter(isSourceNote)
    ));
    await loadNotes();
  };

  const syncEditorScroll = (source: HTMLElement, target: HTMLElement) => {
    if (syncingScrollRef.current) return;

    const sourceScrollable = source.scrollHeight - source.clientHeight;
    const targetScrollable = target.scrollHeight - target.clientHeight;
    if (sourceScrollable <= 0 || targetScrollable <= 0) return;

    syncingScrollRef.current = true;
    target.scrollTop = (source.scrollTop / sourceScrollable) * targetScrollable;
    requestAnimationFrame(() => {
      syncingScrollRef.current = false;
    });
  };

  const getLinkedNote = async (linkId: string) => {
    return await storage.getNoteById(linkId);
  };

  // 處理筆記點擊
  const handleNoteClick = (note: Note, event: React.MouseEvent) => {
    // Ctrl/Cmd + 點擊：外部 Markdown 筆記進入 Obsidian 檢視；文獻筆記維持直接編輯頁
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      if (note.id.includes('/') || note.id.endsWith('.md')) {
        navigate(`/obsidian-note/${encodeURIComponent(note.id)}`);
      } else {
        navigate(`/source-notes/${encodeURIComponent(note.id)}`);
      }
      return;
    }

    // 一般點擊 = 進入直接編輯頁
    navigate(`/source-notes/${encodeURIComponent(note.id)}`);
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
        Array.from(selectedNotes).map(async id => {
          deleteLocalSourceNote(id);
          try { await storage.deleteNote(id); } catch { /* local-only */ }
        })
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
            onClick={async () => {
              await loadNotes();
              navigate('/source-notes');
            }}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="size-4" />
            返回列表
          </Button>
          
          <div className="flex items-center gap-2">
            <Button
              variant={readNoteIds.has(viewingNote.id) ? 'default' : 'outline'}
              onClick={(e) => toggleRead(viewingNote.id, e)}
              className="flex items-center gap-2"
            >
              {readNoteIds.has(viewingNote.id)
                ? <><CheckCircle2 className="size-4" />已讀</>
                : <><Circle className="size-4" />標為已讀</>
              }
            </Button>

            <Button
              variant="outline"
              onClick={() => navigate('/permanent-notes', { state: { linkingNoteId: viewingNote.id } })}
              className="flex items-center gap-2"
            >
              <Link2 className="size-4" />
              連結筆記
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(editContent);
                toast.success('已複製筆記內容');
              }}
              className="flex items-center gap-2"
            >
              <Copy className="size-4" />
              複製
            </Button>

            <div className="min-w-20 text-right text-xs text-gray-500">
              {autoSaveStatus === 'saving' && '儲存中...'}
              {autoSaveStatus === 'pending' && '等待儲存'}
              {autoSaveStatus === 'saved' && '已自動儲存'}
              {autoSaveStatus === 'error' && '儲存失敗'}
            </div>
            
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
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm">來源網址</label>
              {editUrl && (
                <a
                  href={editUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm"
                >
                  <ExternalLink className="size-4" />
                  查看來源
                </a>
              )}
            </div>
            <Input
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              placeholder="輸入來源網址（選填）"
              type="url"
            />
          </div>

          <div>
            <label className="block text-sm mb-2">內容</label>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => {
                  setEditContent(e.target.value);
                  sourceEditContentRef.current = e.target.value;
                }}
                onScroll={(e) => {
                  if (previewRef.current) syncEditorScroll(e.currentTarget, previewRef.current);
                }}
                placeholder="輸入筆記內容（支援 Markdown）"
                className="font-mono h-[70vh] min-h-[560px] resize-y leading-6"
                spellCheck={false}
              />
              <div
                ref={previewRef}
                onScroll={(e) => {
                  if (textareaRef.current) syncEditorScroll(e.currentTarget, textareaRef.current);
                }}
                className="h-[70vh] min-h-[560px] overflow-auto rounded-lg border bg-white p-5 prose max-w-none [&_a]:break-all [&_li]:break-words"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {deferredEditContent}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>

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
          
          <div className="relative max-w-xs" ref={tagInputRef}>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onFocus={() => setShowTagDropdown(true)}
                onBlur={() => setShowTagDropdown(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { handleAddTag(); setShowTagDropdown(false); }
                  if (e.key === 'Escape') setShowTagDropdown(false);
                }}
                placeholder="新增標籤"
                className="flex-1"
              />
              <Button onClick={() => { handleAddTag(); setShowTagDropdown(false); }} variant="outline">
                新增
              </Button>
            </div>
            {showTagDropdown && filteredTagOptions.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                {filteredTagOptions.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors"
                    onMouseDown={(e) => {
                      e.preventDefault(); // prevent input blur so the dropdown stays mounted
                      setNewTag(tag);
                      setShowTagDropdown(false);
                    }}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
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
          <div className="flex items-center gap-1 mt-3">
            {(['all', 'unread', 'read'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filterMode === mode
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {mode === 'all' ? `全部 (${notes.length})` : mode === 'unread' ? `未讀 (${notes.filter(n => !readNoteIds.has(n.id)).length})` : `已讀 (${notes.filter(n => readNoteIds.has(n.id)).length})`}
              </button>
            ))}
          </div>
          {selectedNotes.size > 0 && (
            <p className="text-sm text-blue-600 mt-2">
              已選取 {selectedNotes.size} 則筆記 - 右鍵點擊以顯示操作選單
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 min-w-[320px]">
          <div className="flex-1">
            <div className="relative">
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit(urlInput)}
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text');
                  if (text.startsWith('http://') || text.startsWith('https://')) {
                    e.preventDefault();
                    handleUrlSubmit(text);
                  }
                }}
                placeholder="貼入網址自動送出，可連續貼多個..."
                className="pr-10"
              />
              {fetchingCount > 0 && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {fetchingCount > 1 && <span className="text-xs text-gray-400">{fetchingCount}</span>}
                  <Loader2 className="size-4 animate-spin text-gray-400" />
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              抓取網址需先在設定頁開啟「允許外部網址/AI 分析」，並可能送到外部網站、Jina Reader 或後端設定的 Claude API；請勿貼上含敏感資料的網址。
            </p>
          </div>
        </div>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 select-none"
        style={{ userSelect: 'none' }}
      >
        {filteredNotes.map(note => {
          const isSelected = selectedNotes.has(note.id);
          const isRead = readNoteIds.has(note.id);

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
              className={`relative ${isSelected ? 'ring-2 ring-blue-500' : ''} ${isRead ? 'opacity-60' : ''}`}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs z-10">
                  ✓
                </div>
              )}
              <NoteCard
                note={note}
                sizes={cardSizes}
                onClick={(e) => handleNoteClick(note, e)}
                onLinkClick={() => navigate('/permanent-notes', { state: { linkingNoteId: note.id } })}
                onContextMenu={(e) => handleContextMenu(e, note)}
                className="rounded-b-none border-b-0"
              />
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border border-t-0 border-gray-200 rounded-b-lg">
                <button
                  onClick={(e) => toggleRead(note.id, e)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-600 transition-colors"
                  title={isRead ? '標為未讀' : '標為已讀'}
                >
                  {isRead
                    ? <CheckCircle2 className="size-5 text-green-500" />
                    : <Circle className="size-5" />
                  }
                  <span>{isRead ? '已讀' : '未讀'}</span>
                </button>
                {note.sourceUrl && (
                  <a
                    href={note.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="size-4" />
                    <span>來源</span>
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 拖曳框 */}
      {isSelecting && getSelectionBoxStyle() && (
        <div style={getSelectionBoxStyle()!} />
      )}

      {filteredNotes.length === 0 && fetchingCount === 0 && (
        <div className="text-center py-12 text-gray-500">
          {notes.length === 0
            ? '尚無文獻筆記，在右上角貼入網址以建立第一則文獻筆記'
            : filterMode === 'read' ? '沒有已讀的筆記' : '沒有未讀的筆記'
          }
        </div>
      )}

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
