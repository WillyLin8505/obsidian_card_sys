import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { localApi } from '../utils/api';
import { storage } from '../utils/storage';
import { Note } from '../types/note';
import { NoteChunk } from '../types/ai-search';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ArrowLeft, Save, Plus, X, Tag as TagIcon, Sparkles, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { containsMarkdownImage, preprocessVaultImages } from '../utils/markdownImages';

interface Section {
  heading: string;
  content: string;
  level: number;
}

export function ObsidianNoteView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const config = useMemo(() => storage.getConfig(), []);

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [loading, setLoading] = useState(true);
  const [rawContent, setRawContent] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [connectedNotes, setConnectedNotes] = useState<NoteChunk[]>([]);
  const [searchingConnected, setSearchingConnected] = useState(false);

  const relativePath = id ? decodeURIComponent(id) : '';

  useEffect(() => {
    const stateNote = (location.state as { note?: Note } | null)?.note;

    // Use note passed via navigation state (already in memory — no fetch needed)
    if (stateNote) {
      storage.recordOpened(stateNote.id);
      setNote(stateNote);
      setTitle(stateNote.title);
      setTags(stateNote.tags || []);
      setRawContent(stateNote.content);
      setSections(parseMarkdownSections(stripFrontmatter(stateNote.content)));
      setLoading(false);
      return;
    }

    // Fallback: fetch from server (e.g. direct URL access or page refresh)
    const load = async () => {
      if (!relativePath || !config.notePath) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const found = await localApi.getNoteByPath(relativePath, config.notePath);
        storage.recordOpened(found.id);
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

  function parseMetadataRows(content: string): Array<{ key: string; value: string; isList: boolean }> {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return [];

    const rows: Array<{ key: string; value: string; isList: boolean }> = [];
    const lines = match[1].split('\n');
    let current: { key: string; value: string; isList: boolean } | null = null;

    for (const line of lines) {
      const keyMatch = line.match(/^([^:\n]+):\s*(.*)$/);
      if (keyMatch) {
        current = { key: keyMatch[1].trim(), value: keyMatch[2].trim(), isList: false };
        rows.push(current);
      } else if (current && /^\s+-\s+/.test(line)) {
        const item = line.replace(/^\s+-\s+/, '').trim();
        current.isList = true;
        current.value = current.value ? `${current.value}\n${item}` : item;
      }
    }

    return rows.filter(row => row.key);
  }

  function updateMetadataValue(key: string, value: string) {
    const frontmatter = extractFrontmatter(rawContent);
    if (!frontmatter) return;

    const body = rawContent.slice(frontmatter.length);
    const rows = parseMetadataRows(rawContent).map(row =>
      row.key === key ? { ...row, value } : row
    );
    const yaml = rows.map(row => {
      const lines = row.value.split('\n').map(v => v.trim()).filter(Boolean);
      if (row.isList || lines.length > 1) {
        return `${row.key}:\n${lines.map(v => `  - ${v}`).join('\n')}`;
      }
      return `${row.key}: ${row.value}`;
    }).join('\n');

    const updated = `---\n${yaml}\n---\n${body.replace(/^\n?/, '')}`;
    setRawContent(updated);
  }

  function parseMarkdownSections(markdown: string): Section[] {
    const lines = markdown.split('\n');
    const result: Section[] = [];
    let current: Section | null = null;
    const preamble: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        if (!current && preamble.length > 0) {
          const content = preamble.join('\n').trim();
          if (content) result.push({ heading: '', content, level: 0 });
        }
        if (current) result.push(current);
        current = { heading: headingMatch[2], content: '', level: headingMatch[1].length };
      } else if (current) {
        current.content += (current.content ? '\n' : '') + line;
      } else {
        preamble.push(line);
      }
    }
    if (current) result.push(current);
    if (!current && result.length === 0) {
      const content = preamble.join('\n').trim();
      if (content) result.push({ heading: '', content, level: 0 });
    }
    return result;
  }

  function sectionsToMarkdown(secs: Section[]): string {
    return secs
      .map(s => s.level <= 0
        ? s.content.trim()
        : '#'.repeat(s.level) + ' ' + s.heading + '\n' + s.content.trim()
      )
      .join('\n\n');
  }

  function extractEnrichedFields(content: string): { abstract: string; connect: string[] } {
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fmMatch) return { abstract: '', connect: [] };
    const fm = fmMatch[1];

    const abstractMatch = fm.match(/^abstract:\s*(.+)$/m);
    const abstract = abstractMatch ? abstractMatch[1].trim().replace(/^["']|["']$/g, '') : '';

    const connectBlock = fm.match(/^connect:\s*\n((?:[ \t]+-[ \t]*.+\n?)+)/m);
    const connect = connectBlock
      ? connectBlock[1].split('\n').map(l => l.replace(/^[ \t]+-[ \t]*/, '').trim()).filter(Boolean)
      : [];

    return { abstract, connect };
  }

  const searchConnectedNotes = async (query: string) => {
    if (!query.trim()) return;
    setSearchingConnected(true);
    try {
      const result = await localApi.search(query);
      const filtered = (result.chunks || []).filter(
        (chunk) => !chunk.notePath.endsWith(relativePath)
      );
      setConnectedNotes(filtered.slice(0, 10));
    } catch (err: any) {
      toast.error(`連接筆記搜尋失敗: ${err.message}`);
    } finally {
      setSearchingConnected(false);
    }
  };

  const handleEnrich = async () => {
    if (!relativePath || !config.notePath) return;
    setEnriching(true);
    try {
      await localApi.enrichNote(relativePath, config.notePath);
      toast.success('AI 填充完成，索引已更新');
      // Reload note to show updated frontmatter
      const found = await localApi.getNoteByPath(relativePath, config.notePath);
      setNote(found);
      setRawContent(found.content);
      setSections(parseMarkdownSections(stripFrontmatter(found.content)));
      // Build richer query from AI-enriched abstract + connect keywords
      const { abstract, connect } = extractEnrichedFields(found.content);
      const searchQuery = [found.title, abstract, ...connect].filter(Boolean).join(' ');
      searchConnectedNotes(searchQuery);
    } catch (error: any) {
      toast.error(`填充失敗: ${error.message}`);
    } finally {
      setEnriching(false);
    }
  };

  const handleSave = async () => {
    if (!relativePath || !config.notePath) return;

    try {
      const frontmatter = extractFrontmatter(rawContent);
      const body = sectionsToMarkdown(sections);
      const fullContent = frontmatter + body;

      await localApi.updateNote(relativePath, config.notePath, fullContent);
      toast.success('已儲存至 Obsidian');
      location.key !== 'default' ? navigate(-1) : navigate('/permanent-notes');
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
    <div className="p-6 w-full">
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => location.key !== 'default' ? navigate(-1) : navigate('/permanent-notes')} className="flex items-center gap-2">
          <ArrowLeft className="size-4" />
          返回
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 mr-2">{relativePath}</span>
          <Button
            variant="outline"
            onClick={handleEnrich}
            disabled={enriching}
            className="flex items-center gap-2"
          >
            <Sparkles className="size-4" />
            {enriching ? 'AI 填充中...' : 'AI 填充'}
          </Button>
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

      {parseMetadataRows(rawContent).length > 0 && (
        <Card className="p-4 mb-6 bg-gray-50">
          <h3 className="mb-3 text-sm font-semibold text-gray-600">Metadata</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {parseMetadataRows(rawContent).map(row => (
              <div key={row.key} className="min-w-0 rounded border bg-white px-3 py-2">
                <div className="text-xs font-mono text-gray-500">{row.key}</div>
                <Textarea
                  value={row.value}
                  onChange={e => updateMetadataValue(row.key, e.target.value)}
                  rows={Math.min(Math.max(row.value.split('\n').length, 1), 4)}
                  className="mt-1 min-h-9 resize-y font-mono text-sm"
                  placeholder="未設定"
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Sections */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6 items-start">
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
                <Button variant="ghost" size="sm" onClick={() => handleRemoveSection(index)}>
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
                  {preprocessVaultImages(section.content, config.notePath, relativePath)}
                </ReactMarkdown>
              </div>
            )}
          </Card>
        ))}
        <Button variant="outline" onClick={handleAddSection} className="w-full flex items-center gap-2">
          <Plus className="size-4" />
          新增區段
        </Button>
      </div>

      {/* Connected Notes */}
      {(connectedNotes.length > 0 || searchingConnected) && (
        <Card className="p-4 mb-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <Link2 className="size-5" />
            連接筆記
            {searchingConnected && (
              <span className="text-xs text-gray-400 animate-pulse ml-1">搜尋中...</span>
            )}
          </h3>
          {connectedNotes.length > 0 ? (
            <div className="space-y-2">
              {connectedNotes.map((chunk, i) => {
                const title =
                  chunk.metadata?.title ||
                  chunk.notePath.split('/').pop()?.replace(/\.md$/, '') ||
                  chunk.notePath;
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between border rounded p-2 hover:bg-gray-50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{title}</div>
                      <div className="text-xs text-gray-400 truncate">{chunk.notePath}</div>
                    </div>
                    <span className="text-xs text-blue-500 ml-3 flex-shrink-0">
                      {Math.round(chunk.similarity * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            !searchingConnected && (
              <div className="text-sm text-gray-500 text-center py-2">未找到相關筆記</div>
            )
          )}
        </Card>
      )}

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
