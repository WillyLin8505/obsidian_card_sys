import { DiscoveryNote } from '../types/knowledge-discovery';
import { Badge } from './ui/badge';
import { FileText, Calendar, Folder } from 'lucide-react';

interface KnowledgeDiscoveryCardProps {
  note: DiscoveryNote;
  onClick?: () => void;
  showSimilarity?: boolean;
}

export function KnowledgeDiscoveryCard({ 
  note, 
  onClick, 
  showSimilarity = true 
}: KnowledgeDiscoveryCardProps) {
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'fleet': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'source': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'permanent': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'fleet': return '閃念';
      case 'source': return '文獻';
      case 'permanent': return '永久';
      default: return type;
    }
  };

  const getSimilarityColor = (score: number) => {
    if (score >= 0.8) return 'text-green-400';
    if (score >= 0.6) return 'text-blue-400';
    if (score >= 0.4) return 'text-yellow-400';
    return 'text-gray-400';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div
      onClick={onClick}
      className="group relative bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 
                 hover:bg-gray-800/70 hover:border-gray-600 transition-all duration-200 
                 cursor-pointer backdrop-blur-sm"
    >
      {/* Similarity Score Badge */}
      {showSimilarity && (
        <div className="absolute -top-2 -right-2 bg-gray-900 border border-gray-700 rounded-full px-3 py-1 text-xs font-semibold">
          <span className={getSimilarityColor(note.similarity)}>
            {(note.similarity * 100).toFixed(0)}%
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-shrink-0 mt-1">
          <FileText className="size-5 text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white text-base mb-1 line-clamp-2 group-hover:text-blue-400 transition-colors">
            {note.title}
          </h3>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Folder className="size-3" />
            <span className="truncate">{note.path}</span>
          </div>
        </div>
        <Badge className={`text-xs ${getTypeColor(note.type)}`}>
          {getTypeLabel(note.type)}
        </Badge>
      </div>

      {/* Summary */}
      <p className="text-sm text-gray-300 mb-3 line-clamp-3">
        {note.summary}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        {/* Tags */}
        {note.tags && note.tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {note.tags.slice(0, 3).map((tag, index) => (
              <Badge
                key={index}
                variant="outline"
                className="text-xs bg-gray-900/50 text-gray-400 border-gray-700"
              >
                #{tag}
              </Badge>
            ))}
            {note.tags.length > 3 && (
              <span className="text-xs text-gray-500">
                +{note.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Date */}
        <div className="flex items-center gap-1 text-xs text-gray-500 ml-auto">
          <Calendar className="size-3" />
          {formatDate(note.createdAt)}
        </div>
      </div>

      {/* Hover Effect */}
      <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-blue-500/0 to-purple-500/0 
                      group-hover:from-blue-500/5 group-hover:to-purple-500/5 transition-all duration-300 pointer-events-none" />
    </div>
  );
}
