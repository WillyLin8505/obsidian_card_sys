import { useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Send, Loader2, CheckCircle2, XCircle, ExternalLink, Clock } from 'lucide-react';
import { AISearchResult, NoteChunk } from '../types/ai-search';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AISearchPanelProps {
  onSubmit: (question: string) => Promise<void>;
  isLoading: boolean;
  currentResult: AISearchResult | null;
  connectionStatus: 'connected' | 'disconnected' | 'searching';
}

export function AISearchPanel({ 
  onSubmit, 
  isLoading, 
  currentResult,
  connectionStatus 
}: AISearchPanelProps) {
  const [question, setQuestion] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;
    
    await onSubmit(question.trim());
    setQuestion('');
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <CheckCircle2 className="size-4 text-green-600" />;
      case 'searching':
        return <Loader2 className="size-4 text-blue-600 animate-spin" />;
      case 'disconnected':
        return <XCircle className="size-4 text-red-600" />;
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return '已連接至遠程 Obsidian';
      case 'searching':
        return '正在搜尋中...';
      case 'disconnected':
        return '未連接';
    }
  };

  const formatSimilarity = (score: number) => {
    return `${(score * 100).toFixed(1)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="flex items-center gap-2 text-sm">
        {getStatusIcon()}
        <span className={
          connectionStatus === 'connected' ? 'text-green-600' :
          connectionStatus === 'searching' ? 'text-blue-600' :
          'text-red-600'
        }>
          {getStatusText()}
        </span>
      </div>

      {/* Question Input */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="向您的 Obsidian 知識庫提問..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button 
            type="submit" 
            disabled={isLoading || !question.trim()}
            className="flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            提問
          </Button>
        </div>
        
        <p className="text-xs text-gray-500">
          💡 提示：此搜尋會透過 Tailscale 連接到您的遠程機器，使用 QMD 進行語義搜尋，並由 Claude AI 生成答案
        </p>
      </form>

      {/* Search Results */}
      {currentResult && (
        <div className="space-y-4 border-t pt-6">
          {/* Question */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-1">您的問題</h3>
            <p className="text-blue-800">{currentResult.question}</p>
          </div>

          {/* AI Answer */}
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium flex items-center gap-2">
                🤖 AI 回答
              </h3>
              {currentResult.searchTime && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="size-3" />
                  {currentResult.searchTime}ms
                </div>
              )}
            </div>
            <div className="prose max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {currentResult.answer}
              </ReactMarkdown>
            </div>
          </div>

          {/* Source Chunks */}
          {currentResult.chunks && currentResult.chunks.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium flex items-center gap-2">
                📚 來源參考 ({currentResult.chunks.length} 個片段)
              </h3>
              
              {currentResult.chunks.map((chunk: NoteChunk, index: number) => (
                <div 
                  key={index}
                  className="bg-gray-50 border rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-xs">
                          相似度: {formatSimilarity(chunk.similarity)}
                        </Badge>
                        {chunk.metadata?.tags && chunk.metadata.tags.length > 0 && (
                          <div className="flex gap-1">
                            {chunk.metadata.tags.slice(0, 3).map((tag, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                #{tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-700 flex items-center gap-1">
                        <ExternalLink className="size-3" />
                        {chunk.notePath}
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-sm text-gray-600 bg-white p-3 rounded border">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {chunk.content.substring(0, 300) + (chunk.content.length > 300 ? '...' : '')}
                    </ReactMarkdown>
                  </div>

                  {chunk.metadata?.title && (
                    <p className="text-xs text-gray-500">
                      標題: {chunk.metadata.title}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Metadata */}
          {currentResult.metadata && (
            <div className="text-xs text-gray-500 border-t pt-3">
              <div className="flex gap-4">
                {currentResult.metadata.model && (
                  <span>模型: {currentResult.metadata.model}</span>
                )}
                {currentResult.metadata.tokensUsed && (
                  <span>Token 用量: {currentResult.metadata.tokensUsed}</span>
                )}
                {currentResult.createdAt && (
                  <span>
                    時間: {new Date(currentResult.createdAt).toLocaleString('zh-TW')}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
