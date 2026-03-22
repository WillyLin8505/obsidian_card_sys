import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { localApi } from '../utils/api';
import { storage } from '../utils/storage';
import { Note } from '../types/note';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ArrowLeft, Save, Plus, X, Tag as TagIcon } from 'lucide-react';
import { toast } from 'sonner';

interface Section {
  heading: string;
  content: string;
  level: number;
}

export function ObsidianNoteView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const config = useMemo(() => storage.getConfig(), []);

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [loading, setLoading] = useState(true);
  const [rawContent, setRawContent] = useState('');

  const relativePath = id ? decodeURIComponent(id) : '';

  useEffect(() => {
    const load = async () => {
      if (!relativePath || !config.notePath) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const found = await localApi.getNoteByPath(relativePath, config.notePath);
        setNote(found);
        setTitle(found.title);
        setTags(found.tags || []);
        setRawContent(found.content);
        setSections(parseMarkdownSections(stripFrontmatter(found.content)));
      } catch (error: any) {
        toast.error(`載入失敗: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [relativePath, config.notePath]);

  function stripFrontmatter(content: string): string {
    return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n*/, '');
  }

  function extractFrontmatter(content: string): string {
    const match = content.match(/^(---\s*\n[\s\S]*?\n---\s*\n?)/);
    return match ? match[1] : '';
  }

  function parseMarkdownSections(markdown: string): Section[] {
    const lines = markdown.split('\n');
    const result: Section[] = [];
    let current: Section | null = null;

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        if (current) result.push(current);
        current = { heading: headingMatch[2], content: '', level: headingMatch[1].length };
      } else if (current) {
        current.content += (current.content ? '\n' : '') + line;
      }
    }
    if (current) result.push(current);
    return result;
  }

  function sectionsToMarkdown(secs: Section[]): string {
    return secs
      .map(s => '#'.repeat(s.level) + ' ' + s.heading + '\n' + s.content.trim())
      .join('\n\n');
  }

  const handleSave = async () => {
    if (!relativePath || !config.notePath) return;

    try {
      const frontmatter = extractFrontmatter(rawContent);
      const body = sectionsToMarkdown(sections);
      const fullContent = frontmatter + body;

      await localApi.updateNote(relativePath, config.notePath, fullContent);
      toast.success('已儲存至 Obsidian');
      navigate('/all-files');
    } catch (error: any) {
      toast.error(`儲存失敗: ${error.message}`);
    }
  };

  const handleUpdateSection = (index: number, field: 'heading' | 'content', value: string) => {
    const updated = [...sections];
    updated[index] = { ...updated[index], [field]: value };
    setSections(updated);
  };

  const handleAddSection = () => {
    setSections([...sections, { heading: '新區段', content: '', level: 2 }]);
  };

  const handleRemoveSection = (index: number) => {
    if (sections.length === 1) {
      toast.error('至少需要保留一個區段');
      return;
    }
    setSections(sections.filter((_, i) => i !== index));
  };

  const handleAddTag = () => {
    if (!newTag.trim() || tags.includes(newTag.trim())) return;
    setTags([...tags, newTag.trim()]);
    setNewTag('');
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  if (loading) {
    return <div className="p-6 text-center py-12 text-gray-500">載入中...</div>;
  }

  if (!note) {
    return <div className="p-6 text-center py-12 text-gray-500">找不到筆記</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => navigate('/all-files')} className="flex items-center gap-2">
          <ArrowLeft className="size-4" />
          返回
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 mr-2">{relativePath}</span>
          <Button onClick={handleSave} className="flex items-center gap-2">
            <Save className="size-4" />
            儲存至 Obsidian
          </Button>
        </div>
      </div>

      {/* Title */}
      <div className="mb-6">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="標題"
          className="text-3xl font-bold border-none shadow-none focus-visible:ring-0 px-0"
        />
      </div>

      {/* Sections */}
      <div className="space-y-4 mb-6">
        {sections.map((section, index) => (
          <Card key={index} className="p-4">
            <div className="flex items-start justify-between mb-3">
              <Input
                value={section.heading}
                onChange={(e) => handleUpdateSection(index, 'heading', e.target.value)}
                placeholder="區段標題"
                className="text-xl font-semibold border-none shadow-none focus-visible:ring-0 px-0"
              />
              <Button variant="ghost" size="sm" onClick={() => handleRemoveSection(index)}>
                <X className="size-4" />
              </Button>
            </div>
            <Textarea
              value={section.content}
              onChange={(e) => handleUpdateSection(index, 'content', e.target.value)}
              placeholder="輸入內容（支援 Markdown）"
              rows={6}
              className="font-mono resize-y"
            />
          </Card>
        ))}
        <Button variant="outline" onClick={handleAddSection} className="w-full flex items-center gap-2">
          <Plus className="size-4" />
          新增區段
        </Button>
      </div>

      {/* Tags */}
      <Card className="p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <TagIcon className="size-5" />
          標籤
        </h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {tags.length > 0 ? (
            tags.map(tag => (
              <Badge key={tag} variant="secondary" className="cursor-pointer hover:bg-red-100" onClick={() => handleRemoveTag(tag)}>
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
    </div>
  );
}
