import { Note, CardFontSizes } from '../types/note';
import { Link2, Tag, Calendar } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

const DEFAULT_SIZES: CardFontSizes = {
  title: 18,
  h1: 16,
  h2: 14,
  h3: 13,
  h4: 12,
  body: 12,
  metadata: 11,
};

interface NoteCardProps {
  note: Note;
  sizes?: CardFontSizes;
  onClick?: (event: React.MouseEvent) => void;
  onLinkClick?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  className?: string;
}

export function NoteCard({ note, sizes: sizesProp, onClick, onLinkClick, onContextMenu, className }: NoteCardProps) {
  const sizes = { ...DEFAULT_SIZES, ...(sizesProp || {}) };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const getTypeColor = (type: Note['type']) => {
    switch (type) {
      case 'fleet':   return 'bg-yellow-100 text-yellow-800';
      case 'source':  return 'bg-green-100 text-green-800';
      case 'permanent': return 'bg-blue-100 text-blue-800';
    }
  };

  const getTypeLabel = (type: Note['type']) => {
    switch (type) {
      case 'fleet':   return '閃念';
      case 'source':  return '文獻';
      case 'permanent': return '永久';
    }
  };

  // Extract first heading and its content
  const getFirstSectionContent = (content: string) => {
    const withoutFrontmatter = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n*/, '').trim();
    const lines = withoutFrontmatter.split('\n');
    let firstHeadingIndex = -1;
    let headingTitle = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^#\s+.+/)) {
        firstHeadingIndex = i;
        headingTitle = line.replace(/^#\s+/, '');
        break;
      }
    }

    if (firstHeadingIndex === -1) {
      return { title: '', content: withoutFrontmatter.substring(0, 100) };
    }

    let nextHeadingIndex = -1;
    for (let i = firstHeadingIndex + 1; i < lines.length; i++) {
      if (lines[i].trim().match(/^#\s+.+/)) {
        nextHeadingIndex = i;
        break;
      }
    }

    const sectionContent = nextHeadingIndex !== -1
      ? lines.slice(firstHeadingIndex + 1, nextHeadingIndex).join('\n').trim()
      : lines.slice(firstHeadingIndex + 1).join('\n').trim();

    return { title: headingTitle, content: sectionContent };
  };

  const { title: sectionTitle, content: sectionContent } = getFirstSectionContent(note.content);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-white cursor-pointer h-64 flex flex-col overflow-hidden${className ? ` ${className}` : ''}`}
          onClick={onClick}
          onContextMenu={onContextMenu}
        >
          <div className="flex items-start justify-between mb-2 shrink-0">
            <h3 className="flex-1 font-bold line-clamp-1" style={{ fontSize: `${sizes.title}px` }}>{note.title}</h3>
            <span className={`text-xs px-2 py-1 rounded ml-2 shrink-0 ${getTypeColor(note.type)}`}>
              {getTypeLabel(note.type)}
            </span>
          </div>

          {sectionTitle && (
            <p className="font-semibold text-gray-800 mb-1 line-clamp-1 shrink-0" style={{ fontSize: `${sizes.h1}px` }}>
              {sectionTitle}
            </p>
          )}

          <p className="text-gray-600 line-clamp-3 mb-2 flex-1 min-h-0 overflow-hidden" style={{ fontSize: `${sizes.body}px` }}>
            {sectionContent.substring(0, 150)}{sectionContent.length > 150 ? '...' : ''}
          </p>

          {note.tags.length > 0 && (
            <div className="flex items-center gap-1 mb-2 flex-wrap shrink-0 overflow-hidden max-h-[36px]">
              <Tag className="size-3 text-gray-400 shrink-0" />
              {note.tags.map((tag, index) => (
                <span key={index} className="bg-gray-100 px-2 py-0.5 rounded" style={{ fontSize: `${sizes.metadata}px` }}>
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between shrink-0" style={{ fontSize: `${sizes.metadata}px` }}>
            <div className="flex items-center gap-1 text-gray-500">
              <Calendar className="size-3" />
              {formatDate(note.updatedAt)}
            </div>
            {onLinkClick && (
              <button
                onClick={(e) => { e.stopPropagation(); onLinkClick(); }}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
              >
                <Link2 className="size-5" />
                連結
              </button>
            )}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>Ctrl+Click 開啟編輯</p>
      </TooltipContent>
    </Tooltip>
  );
}
