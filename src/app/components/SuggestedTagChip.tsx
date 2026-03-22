import { SuggestedTag } from '../types/knowledge-discovery';
import { Badge } from './ui/badge';
import { Hash, TrendingUp } from 'lucide-react';

interface SuggestedTagChipProps {
  tag: SuggestedTag;
  onClick?: () => void;
  selected?: boolean;
}

export function SuggestedTagChip({ tag, onClick, selected = false }: SuggestedTagChipProps) {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'from-green-500/20 to-emerald-500/20 border-green-500/50 text-green-300';
    if (confidence >= 0.6) return 'from-blue-500/20 to-cyan-500/20 border-blue-500/50 text-blue-300';
    if (confidence >= 0.4) return 'from-yellow-500/20 to-amber-500/20 border-yellow-500/50 text-yellow-300';
    return 'from-gray-500/20 to-slate-500/20 border-gray-500/50 text-gray-300';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return '高相關';
    if (confidence >= 0.6) return '中等';
    if (confidence >= 0.4) return '一般';
    return '低';
  };

  return (
    <div
      onClick={onClick}
      className={`
        group relative inline-flex items-center gap-2 px-4 py-2.5 rounded-full
        bg-gradient-to-br ${getConfidenceColor(tag.confidence)}
        border backdrop-blur-sm
        cursor-pointer transition-all duration-300
        hover:scale-105 hover:shadow-lg hover:shadow-blue-500/20
        ${selected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-900' : ''}
      `}
    >
      {/* Hash Icon */}
      <Hash className="size-4" />

      {/* Tag Name */}
      <span className="font-medium text-sm">
        {tag.tag}
      </span>

      {/* Note Count */}
      <Badge className="bg-gray-900/80 text-gray-300 text-xs px-2 py-0.5 border-gray-700">
        {tag.noteCount}
      </Badge>

      {/* Confidence Indicator */}
      <div className="flex items-center gap-1">
        <TrendingUp className="size-3" />
        <span className="text-xs font-semibold">
          {(tag.confidence * 100).toFixed(0)}%
        </span>
      </div>

      {/* Tooltip */}
      <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 
                      rounded-lg px-3 py-1.5 text-xs text-gray-300 whitespace-nowrap
                      opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none
                      shadow-lg z-10">
        <div className="text-center">
          <div className="font-semibold">{getConfidenceLabel(tag.confidence)}</div>
          {tag.reason && <div className="text-gray-400 mt-0.5">{tag.reason}</div>}
        </div>
        {/* Arrow */}
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 border-r border-b border-gray-700 rotate-45" />
      </div>

      {/* Glow Effect */}
      {selected && (
        <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-xl -z-10" />
      )}
    </div>
  );
}
