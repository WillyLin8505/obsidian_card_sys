import { Note } from '../types/note';
import { Link2, Tag, Calendar } from 'lucide-react';

interface NoteCardProps {
  note: Note;
  onClick?: (event: React.MouseEvent) => void;
  onLinkClick?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}

export function NoteCard({ note, onClick, onLinkClick, onContextMenu }: NoteCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    });
  };

  const getTypeColor = (type: Note['type']) => {
    switch (type) {
      case 'fleet':
        return 'bg-yellow-100 text-yellow-800';
      case 'source':
        return 'bg-green-100 text-green-800';
      case 'permanent':
        return 'bg-blue-100 text-blue-800';
    }
  };

  const getTypeLabel = (type: Note['type']) => {
    switch (type) {
      case 'fleet':
        return '閃念';
      case 'source':
        return '文獻';
      case 'permanent':
        return '永久';
    }
  };

  // 提取第一個大標題及其內容
  const getFirstSectionContent = (content: string) => {
    // 移除 frontmatter
    const withoutFrontmatter = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n*/, '').trim();
    
    // 找到第一個單個 # 標題（大標題）
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
    
    // 找到下一個 # 標題的位置
    let nextHeadingIndex = -1;
    for (let i = firstHeadingIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^#\s+.+/)) {
        nextHeadingIndex = i;
        break;
      }
    }
    
    // 提取第一個標題下的內容
    let sectionContent;
    if (nextHeadingIndex !== -1) {
      // 截取到下一個大標題之前
      sectionContent = lines.slice(firstHeadingIndex + 1, nextHeadingIndex).join('\n').trim();
    } else {
      // 沒有下一個大標題，取所有剩餘內容
      sectionContent = lines.slice(firstHeadingIndex + 1).join('\n').trim();
    }
    
    return { title: headingTitle, content: sectionContent };
  };

  const { title: sectionTitle, content: sectionContent } = getFirstSectionContent(note.content);

  return (
    <div 
      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-white cursor-pointer"
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="flex-1">{note.title}</h3>
        <span className={`text-xs px-2 py-1 rounded ${getTypeColor(note.type)}`}>
          {getTypeLabel(note.type)}
        </span>
      </div>
      
      {sectionTitle && (
        <p className="text-[16px] font-semibold text-gray-800 mb-1">{sectionTitle}</p>
      )}
      
      <p className="text-gray-600 text-[12px] line-clamp-3 mb-3">
        {sectionContent.substring(0, 150)}{sectionContent.length > 150 ? '...' : ''}
      </p>
      
      {note.tags.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Tag className="size-4 text-gray-400" />
          {note.tags.map((tag, index) => (
            <span key={index} className="text-xs bg-gray-100 px-2 py-1 rounded">
              #{tag}
            </span>
          ))}
        </div>
      )}
      
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <Calendar className="size-3" />
          {formatDate(note.updatedAt)}
        </div>
        
        {onLinkClick && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLinkClick();
            }}
            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
          >
            <Link2 className="size-4" />
            連結
          </button>
        )}
      </div>
    </div>
  );
}