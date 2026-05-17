import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { api } from '../utils/api';
import { storage } from '../utils/storage';
import { Note } from '../types/note';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { ArrowLeft, Save, Trash2, Link2, Tag as TagIcon, Plus, X, Edit3, Eye } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card } from '../components/ui/card';
import { toast } from 'sonner';
import { containsMarkdownImage, preprocessVaultImages } from '../utils/markdownImages';

interface Section {
  heading: string;
  content: string;
  level: number;
}

interface Frontmatter {
  createDate?: string;
  aliases?: string[];
  tags?: string[];
}

export function NoteView() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = rawId ? decodeURIComponent(rawId) : undefined;
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const draftState = location.state as { title?: string; content?: string; type?: Note['type']; tags?: string[] } | null;
  const [note, setNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(true); // 預設進入編輯模式
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [aliases, setAliases] = useState<string[]>([]);
  const [createDate, setCreateDate] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [linkedNotes, setLinkedNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  // 解析 YAML frontmatter
  const parseFrontmatter = (markdown: string): { frontmatter: Frontmatter; content: string } => {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = markdown.match(frontmatterRegex);

    if (!match) {
      return { frontmatter: {}, content: markdown };
    }

    const frontmatterText = match[1];
    const content = match[2];
    const frontmatter: Frontmatter = {};

    // 解析 create date
    const createDateMatch = frontmatterText.match(/create date:\s*(.+)/);
    if (createDateMatch) {
      frontmatter.createDate = createDateMatch[1].trim();
    }

    // 解析 aliases
    const aliasesMatch = frontmatterText.match(/aliases:\s*\n([\s\S]*?)(?=\ntags:|---)/);
    if (aliasesMatch) {
      const aliasesText = aliasesMatch[1];
      frontmatter.aliases = aliasesText
        .split('\n')
        .map(line => line.trim().replace(/^-\s*/, ''))
        .filter(Boolean);
    }

    // 解析 tags（支援多行格式）
    const tagsMatch = frontmatterText.match(/tags:\s*\n([\s\S]*?)(?=\n\w+:|$)/);
    if (tagsMatch) {
      const tagsText = tagsMatch[1];
      frontmatter.tags = tagsText
        .split('\n')
        .map(line => line.trim().replace(/^-\s*/, ''))
        .filter(Boolean);
    }

    return { frontmatter, content };
  };

  // 生成 frontmatter
  const generateFrontmatter = (createDate: string, aliases: string[], tags: string[]): string => {
    let frontmatter = '---\n';
    frontmatter += `create date: ${createDate || new Date().toISOString().split('T')[0]}\n`;
    
    if (aliases.length > 0) {
      frontmatter += 'aliases:\n';
      aliases.forEach(alias => {
        frontmatter += `  - ${alias}\n`;
      });
    } else {
      frontmatter += 'aliases:\n';
    }
    
    frontmatter += 'tags:\n';
    if (tags.length > 0) {
      tags.forEach(tag => {
        frontmatter += `  - ${tag}\n`;
      });
    }
    
    frontmatter += '---\n\n';
    return frontmatter;
  };

  // 解析 Markdown 成結構化區段
  const parseMarkdownSections = (markdown: string): Section[] => {
    const lines = markdown.split('\n');
    const parsedSections: Section[] = [];
    let currentSection: Section | null = null;
    const preamble: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        if (!currentSection && preamble.length > 0) {
          const content = preamble.join('\n').trim();
          if (content) {
            parsedSections.push({ heading: '', content, level: 0 });
          }
        }
        // 保存上一個區段
        if (currentSection) {
          parsedSections.push(currentSection);
        }
        // 創建新區段
        currentSection = {
          heading: headingMatch[2],
          content: '',
          level: headingMatch[1].length,
        };
      } else if (currentSection) {
        // 添加內容到當前區段
        currentSection.content += (currentSection.content ? '\n' : '') + line;
      } else {
        preamble.push(line);
      }
    }

    // 添加最後一個區段
    if (currentSection) {
      parsedSections.push(currentSection);
    }
    if (!currentSection && parsedSections.length === 0) {
      const content = preamble.join('\n').trim();
      if (content) {
        parsedSections.push({ heading: '', content, level: 0 });
      }
    }

    return parsedSections;
  };

  // 將區段轉換回 Markdown
  const sectionsToMarkdown = (sections: Section[]): string => {
    return sections
      .map((section) => {
        if (section.level <= 0) {
          return section.content.trim();
        }
        const heading = '#'.repeat(section.level) + ' ' + section.heading;
        return heading + '\n' + section.content.trim();
      })
      .join('\n\n');
  };

  useEffect(() => {
    const loadNote = async () => {
      if (isNew) {
        const content = draftState?.content || '';
        const { frontmatter, content: bodyContent } = parseFrontmatter(content);
        setTitle(draftState?.title || '新筆記');
        setCreateDate(new Date().toISOString().split('T')[0]);
        setAliases(frontmatter.aliases || []);
        const draftTags = draftState?.tags || [];
        setTags([...new Set([...(frontmatter.tags || []), ...draftTags])]);
        setSections(parseMarkdownSections(bodyContent));
        setLoading(false);
        return;
      }

      if (id) {
        try {
          setLoading(true);
          const foundNote = await storage.getNoteById(id);
          if (foundNote) {
            storage.recordOpened(foundNote.id);
            setNote(foundNote);
            setTitle(foundNote.title);

            // 解析 frontmatter
            const { frontmatter, content } = parseFrontmatter(foundNote.content);

            // 設置 frontmatter 資料 - 自動帶入建立日期
            const parseDateSafe = (s: string | undefined): string => {
              if (!s) return new Date().toISOString().split('T')[0];
              const d = new Date(s);
              return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
            };
            const noteCreatedDate = parseDateSafe(foundNote.createdAt);

            setCreateDate(frontmatter.createDate || noteCreatedDate);
            setAliases(frontmatter.aliases || []);

            // 合併 frontmatter 標籤和 note.tags
            const allTags = [...new Set([...(frontmatter.tags || []), ...(foundNote.tags || [])])];
            setTags(allTags);

            // 解析內容區段
            setSections(parseMarkdownSections(content));

            // Load linked notes
            if (foundNote.links && foundNote.links.length > 0) {
              const linkedNotesData = await Promise.all(
                foundNote.links.map((linkId) => storage.getNoteById(linkId))
              );
              setLinkedNotes(linkedNotesData.filter(Boolean) as Note[]);
            }
          } else {
            toast.error('找不到筆記');
          }
        } catch (error: any) {
          console.error('Error loading note:', error);
          toast.error(`載入筆記失敗: ${error.message}`);
        } finally {
          setLoading(false);
        }
      }
    };
    loadNote();
  }, [id]);

  const handleSave = async () => {
    if (!id) return;

    try {
      const bodyContent = sectionsToMarkdown(sections);
      const frontmatterStr = generateFrontmatter(createDate, aliases, tags);
      const fullContent = frontmatterStr + bodyContent;

      if (isNew) {
        const noteType = draftState?.type || 'fleet';
        const newNote: Note = {
          id: '',
          title,
          content: fullContent,
          type: noteType,
          tags,
          links: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await storage.addNote(newNote);
        toast.success('筆記已建立');
        if (noteType === 'source') navigate('/source-notes');
        else if (noteType === 'permanent') navigate('/permanent-notes');
        else navigate('/all-files');
        return;
      }

      await storage.updateNote(id, {
        title,
        content: fullContent,
        tags,
      });

      const updatedNote = await storage.getNoteById(id);
      if (updatedNote) {
        setNote(updatedNote);
      }
      toast.success('筆記已儲存');

      if (note?.type === 'fleet') {
        navigate('/all-files');
      } else if (note?.type === 'source') {
        navigate('/source-notes');
      } else if (note?.type === 'permanent') {
        navigate('/permanent-notes');
      } else {
        navigate('/all-files');
      }
    } catch (error: any) {
      console.error('Error saving note:', error);
      toast.error(`儲存失敗: ${error.message}`);
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm('確定要刪除這則筆記嗎？')) return;

    try {
      await storage.deleteNote(id);
      toast.success('筆記已刪除');

      if (note?.type === 'source') {
        navigate('/source-notes');
      } else {
        navigate('/all-files');
      }
    } catch (error: any) {
      console.error('Error deleting note:', error);
      toast.error(`刪除失敗: ${error.message}`);
    }
  };

  const handleAddTag = async () => {
    if (!newTag.trim()) return;

    if (!tags.includes(newTag.trim())) {
      const updatedTags = [...tags, newTag.trim()];
      setTags(updatedTags);
      setNewTag('');
      toast.success('標籤已新增（記得儲存）');
    } else {
      toast.error('標籤已存在');
    }
  };

  const handleRemoveTag = (tag: string) => {
    const updatedTags = tags.filter((t) => t !== tag);
    setTags(updatedTags);
    toast.success('標籤已移除（記得儲存）');
  };

  const handleAddAlias = () => {
    if (!newAlias.trim()) return;

    if (!aliases.includes(newAlias.trim())) {
      const updatedAliases = [...aliases, newAlias.trim()];
      setAliases(updatedAliases);
      setNewAlias('');
      toast.success('別名已新增（記得儲存）');
    } else {
      toast.error('別名已存在');
    }
  };

  const handleRemoveAlias = (alias: string) => {
    const updatedAliases = aliases.filter((a) => a !== alias);
    setAliases(updatedAliases);
    toast.success('別名已移除（記得儲存）');
  };

  const handleUpdateSection = (index: number, field: 'heading' | 'content', value: string) => {
    const newSections = [...sections];
    newSections[index][field] = value;
    setSections(newSections);
  };

  const handleAddSection = () => {
    setSections([
      ...sections,
      {
        heading: '新區段',
        content: '',
        level: 2,
      },
    ]);
  };

  const handleRemoveSection = (index: number) => {
    if (sections.length === 1) {
      toast.error('至少需要保留一個區段');
      return;
    }
    const newSections = sections.filter((_, i) => i !== index);
    setSections(newSections);
  };

  const handleRemoveLink = async (linkedNoteId: string) => {
    if (!id) return;

    try {
      // Get links to find the link ID
      await storage.removeLink(id, linkedNoteId);
      setLinkedNotes(linkedNotes.filter((n) => n.id !== linkedNoteId));
      const updatedNote = await storage.getNoteById(id);
      if (updatedNote) setNote(updatedNote);
      toast.success('連結已移除');
    } catch (error: any) {
      console.error('Error removing link:', error);
      toast.error(`移除連結失敗: ${error.message}`);
    }
  };

  const handleLinkClick = () => {
    navigate('/permanent-notes', { state: { linkingNoteId: id } });
  };

  const handleBack = () => {
    if (isNew) {
      navigate('/all-files');
      return;
    }
    if (location.key !== 'default') {
      navigate(-1);
      return;
    }
    if (note?.type === 'fleet') navigate('/all-files');
    else if (note?.type === 'source') navigate('/source-notes');
    else navigate('/permanent-notes');
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12 text-gray-500">載入中...</div>
      </div>
    );
  }

  if (!note && !isNew) {
    return (
      <div className="p-6">
        <div className="text-center py-12 text-gray-500">找不到筆記</div>
      </div>
    );
  }

  return (
    <div className={isEditing ? 'p-6 w-full' : 'p-6 max-w-5xl mx-auto'}>
      <div className="flex items-center justify-between mb-6">
        <Button
          variant="ghost"
          onClick={handleBack}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="size-4" />
          返回
        </Button>

        <div className="flex items-center gap-2">
          {!isNew && (
            <Button
              variant="outline"
              onClick={handleLinkClick}
              className="flex items-center gap-2"
            >
              <Link2 className="size-4" />
              連結筆記
            </Button>
          )}

          {isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={() => setIsEditing(false)}
                className="flex items-center gap-2"
              >
                <Eye className="size-4" />
                預覽
              </Button>
              <Button onClick={handleSave} className="flex items-center gap-2">
                <Save className="size-4" />
                儲存
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)} className="flex items-center gap-2">
              <Edit3 className="size-4" />
              編輯
            </Button>
          )}

          {!isNew && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="flex items-center gap-2"
            >
              <Trash2 className="size-4" />
              刪除
            </Button>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="mb-6">
        {isEditing ? (
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="輸入標題"
            className="text-3xl font-bold border-none shadow-none focus-visible:ring-0 px-0"
          />
        ) : (
          <h1 className="text-3xl font-bold">{title}</h1>
        )}
      </div>

      {/* Metadata Section */}
      <Card className="p-4 mb-6 bg-gray-50">
        <h3 className="mb-3 text-sm font-semibold text-gray-600">元數據</h3>
        
        {/* Create Date */}
        <div className="mb-3">
          <label className="text-sm text-gray-600 block mb-1">建立日期</label>
          {isEditing ? (
            <Input
              value={createDate}
              onChange={(e) => setCreateDate(e.target.value)}
              placeholder="YYYY-MM-DD"
              className="max-w-xs"
            />
          ) : (
            <div className="text-sm">{createDate || '未設定'}</div>
          )}
        </div>

        {/* Aliases */}
        <div>
          <label className="text-sm text-gray-600 block mb-1">別名</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {aliases && aliases.length > 0 ? (
              aliases.map((alias) => (
                <Badge
                  key={alias}
                  variant="outline"
                  className={isEditing ? 'cursor-pointer hover:bg-red-100' : ''}
                  onClick={isEditing ? () => handleRemoveAlias(alias) : undefined}
                >
                  {alias}{isEditing && <X className="size-3 ml-1" />}
                </Badge>
              ))
            ) : (
              <div className="text-sm text-gray-500">尚無別名</div>
            )}
          </div>
          {isEditing && (
            <div className="flex gap-2 max-w-md">
              <Input
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddAlias()}
                placeholder="新增別名"
              />
              <Button onClick={handleAddAlias} variant="outline">
                <Plus className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Sections */}
      <div className="mb-6">
        {isEditing ? (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
            {sections.map((section, index) => (
              <Card key={index} className="p-4 min-w-0">
                {section.level > 0 && (
                  <div className="flex items-start justify-between mb-3">
                    <Input
                      value={section.heading}
                      onChange={(e) => handleUpdateSection(index, 'heading', e.target.value)}
                      placeholder="區段標題"
                      className="text-xl font-semibold border-none shadow-none focus-visible:ring-0 px-0"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveSection(index)}
                      className="flex-shrink-0"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                )}
                <Textarea
                  value={section.content}
                  onChange={(e) => handleUpdateSection(index, 'content', e.target.value)}
                  placeholder="輸入內容（支援 Markdown）"
                  className="h-[500px] resize-none overflow-y-auto font-mono"
                />
                {containsMarkdownImage(section.content) && (
                  <div className="mt-3 prose prose-sm max-w-none overflow-hidden">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        img: ({ src, alt }) => (
                          <img
                            src={src || ''}
                            alt={alt || ''}
                            className="max-w-full max-h-[520px] rounded border object-contain"
                          />
                        ),
                      }}
                    >
                      {preprocessVaultImages(section.content)}
                    </ReactMarkdown>
                  </div>
                )}
              </Card>
            ))}
            <Button
              variant="outline"
              onClick={handleAddSection}
              className="w-full flex items-center gap-2 xl:col-span-3"
            >
              <Plus className="size-4" />
              新增區段
            </Button>
          </div>
        ) : (
          <div className="prose max-w-none bg-white border rounded-lg p-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {preprocessVaultImages(sectionsToMarkdown(sections))}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* Tags Section */}
      <Card className="p-4 mb-6">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <TagIcon className="size-5" />
          標籤
        </h3>

        <div className="flex flex-wrap gap-2 mb-3">
          {tags && tags.length > 0 ? (
            tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="cursor-pointer hover:bg-red-100"
                onClick={() => handleRemoveTag(tag)}
              >
                #{tag} <X className="size-3 ml-1" />
              </Badge>
            ))
          ) : (
            <div className="text-sm text-gray-500">尚無標籤</div>
          )}
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
            <Plus className="size-4" />
          </Button>
        </div>
      </Card>

      {/* Linked Notes Section */}
      <Card className="p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <Link2 className="size-5" />
          連結的筆記 ({linkedNotes.length})
        </h3>
        {linkedNotes.length > 0 ? (
          <div className="space-y-2">
            {linkedNotes.map((linkedNote) => (
              <div
                key={linkedNote.id}
                className="border rounded-lg p-3 hover:bg-gray-50 flex items-center justify-between group"
              >
                <div
                  className="flex items-center gap-2 flex-1 cursor-pointer"
                  onClick={() => {
                    // 所有連結都跳轉到永久筆記頁面，並傳遞筆記 ID
                    navigate(`/permanent-notes?noteId=${linkedNote.id}`);
                  }}
                >
                  <Link2 className="size-4 text-gray-400" />
                  <div>
                    <div className="font-medium">{linkedNote.title}</div>
                    <div className="text-sm text-gray-500">
                      {linkedNote.type === 'fleet'
                        ? '閃念筆記'
                        : linkedNote.type === 'source'
                        ? '文獻筆記'
                        : '永久筆記'}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveLink(linkedNote.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500 text-center py-4">
            尚無連結的筆記
          </div>
        )}
      </Card>
    </div>
  );
}
