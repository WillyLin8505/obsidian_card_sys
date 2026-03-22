import { RelatedNote } from '../types/knowledge-discovery';
import { Badge } from './ui/badge';
import { FileText, Link2, Tag, Sparkles, ArrowLeft } from 'lucide-react';

interface RelatedNoteCardProps {
  relatedNote: RelatedNote;
  onClick?: () => void;
}

export function RelatedNoteCard({ relatedNote, onClick }: RelatedNoteCardProps) {
  const { note, relationReason, relationScore, relationDetails } = relatedNote;

  const getRelationIcon = () => {
    switch (relationReason) {
      case 'semantic':
        return <Sparkles className="size-4 text-purple-400" />;
      case 'explicit_link':
        return <Link2 className="size-4 text-blue-400" />;
      case 'shared_tags':
        return <Tag className="size-4 text-green-400" />;
      case 'backlink':
        return <ArrowLeft className="size-4 text-yellow-400" />;
    }
  };

  const getRelationLabel = () => {
    switch (relationReason) {
      case 'semantic':
        return '語義相似';
      case 'explicit_link':
        return '明確連結';
      case 'shared_tags':
        return '共享標籤';
      case 'backlink':
        return '反向連結';
    }
  };

  const getRelationColor = () => {
    switch (relationReason) {
      case 'semantic':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'explicit_link':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'shared_tags':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'backlink':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.7) return 'text-green-400';
    if (score >= 0.5) return 'text-blue-400';
    return 'text-gray-400';
  };

  return (
    <div
      onClick={onClick}
      className="group relative bg-gray-800/40 border border-gray-700/40 rounded-lg p-3.5
                 hover:bg-gray-800/60 hover:border-gray-600/50 transition-all duration-200
                 cursor-pointer backdrop-blur-sm"
    >
      {/* Relation Badge */}
      <div className="flex items-center gap-2 mb-2.5">
        <Badge className={`text-xs flex items-center gap-1 ${getRelationColor()}`}>
          {getRelationIcon()}
          {getRelationLabel()}
        </Badge>
        <span className={`text-xs font-semibold ${getScoreColor(relationScore)}`}>
          {(relationScore * 100).toFixed(0)}%
        </span>
      </div>

      {/* Note Info */}
      <div className="flex items-start gap-2 mb-2">
        <FileText className="size-4 text-gray-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-white text-sm mb-0.5 line-clamp-2 group-hover:text-blue-400 transition-colors">
            {note.title}
          </h4>
          <p className="text-xs text-gray-400 truncate">{note.path}</p>
        </div>
      </div>

      {/* Summary */}
      <p className="text-xs text-gray-400 mb-2 line-clamp-2">
        {note.summary}
      </p>

      {/* Relation Details */}
      {relationDetails?.sharedTags && relationDetails.sharedTags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-gray-500">共享標籤:</span>
          {relationDetails.sharedTags.slice(0, 3).map((tag, index) => (
            <Badge
              key={index}
              variant="outline"
              className="text-xs bg-gray-900/50 text-green-400 border-green-500/30"
            >
              #{tag}
            </Badge>
          ))}
          {relationDetails.sharedTags.length > 3 && (
            <span className="text-xs text-gray-500">
              +{relationDetails.sharedTags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Hover Effect */}
      <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-blue-500/0 to-purple-500/0
                      group-hover:from-blue-500/3 group-hover:to-purple-500/3 transition-all duration-300 pointer-events-none" />
    </div>
  );
}
