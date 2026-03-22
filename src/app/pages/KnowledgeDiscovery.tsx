import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../utils/api';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { KnowledgeDiscoveryCard } from '../components/KnowledgeDiscoveryCard';
import { RelatedNoteCard } from '../components/RelatedNoteCard';
import { SuggestedTagChip } from '../components/SuggestedTagChip';
import { Search, Loader2, Sparkles, Network, Tags, FileText, TrendingUp } from 'lucide-react';
import { KnowledgeDiscoveryResult, DiscoveryNote, RelatedNote, SuggestedTag } from '../types/knowledge-discovery';
import { Note } from '../types/note';
import { toast } from 'sonner';

export function KnowledgeDiscovery() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<KnowledgeDiscoveryResult | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const handleSearch = async (searchQuery?: string) => {
    const q = searchQuery || query;
    if (!q.trim()) {
      toast.error('請輸入搜尋關鍵字');
      return;
    }

    setLoading(true);

    try {
      const response = await api.knowledgeDiscovery.discover({ query: q });
      
      setResult(response);
      toast.success(`發現 ${response.relevantNotes.length} 則相關筆記`);
    } catch (error: any) {
      console.error('Knowledge discovery error:', error);
      toast.error(`搜尋失敗: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleNoteClick = (note: DiscoveryNote) => {
    // Navigate to the appropriate note page based on type
    if (note.type === 'fleet') {
      navigate(`/fleet-notes/${note.id}`);
    } else if (note.type === 'source') {
      navigate(`/source-notes/${note.id}`);
    } else {
      navigate('/permanent-notes', { state: { selectedNoteId: note.id } });
    }
  };

  const handleTagClick = (tag: SuggestedTag) => {
    if (selectedTags.has(tag.tag)) {
      selectedTags.delete(tag.tag);
      setSelectedTags(new Set(selectedTags));
    } else {
      setSelectedTags(new Set([...selectedTags, tag.tag]));
    }
    // Could trigger a refined search with selected tags
  };

  const handleTagSearch = (tag: string) => {
    setQuery(tag);
    handleSearch(tag);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      {/* Hero Section */}
      <div className="border-b border-gray-700/50 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl border border-blue-500/30">
              <Network className="size-8 text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                知識發現
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                探索您的 Zettelkasten 知識圖譜
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
              <Input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="輸入問題、關鍵字或概念..."
                disabled={loading}
                className="pl-12 pr-32 h-14 bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 
                           focus:border-blue-500 focus:ring-blue-500/20 text-base"
              />
              <Button
                type="submit"
                disabled={loading || !query.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 px-6 bg-gradient-to-r from-blue-600 to-purple-600 
                           hover:from-blue-500 hover:to-purple-500 border-0"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    搜尋中...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4 mr-2" />
                    發現知識
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {!result && !loading && (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center p-6 bg-gray-800/30 rounded-full mb-6">
              <Network className="size-16 text-gray-600" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-300 mb-3">
              開始探索您的知識網絡
            </h2>
            <p className="text-gray-500 max-w-md mx-auto">
              輸入任何問題、概念或關鍵字，系統會為您找到相關筆記、連結關係和建議標籤
            </p>
          </div>
        )}

        {result && (
          <div className="space-y-8">
            {/* Query Info */}
            <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-sm">
                <Search className="size-4 text-blue-400" />
                <span className="text-gray-400">搜尋:</span>
                <span className="font-semibold text-white">"{result.query}"</span>
                <span className="text-gray-500 ml-auto">
                  {new Date(result.timestamp).toLocaleString('zh-TW')}
                </span>
              </div>
            </div>

            {/* Suggested Tags */}
            {result.suggestedTags.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Tags className="size-5 text-purple-400" />
                  <h2 className="text-xl font-semibold">建議標籤</h2>
                  <span className="text-sm text-gray-500">
                    ({result.suggestedTags.length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {result.suggestedTags.map((tag, index) => (
                    <SuggestedTagChip
                      key={index}
                      tag={tag}
                      selected={selectedTags.has(tag.tag)}
                      onClick={() => handleTagClick(tag)}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  💡 點擊標籤以精煉搜尋結果
                </p>
              </section>
            )}

            {/* Relevant Notes */}
            {result.relevantNotes.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="size-5 text-blue-400" />
                  <h2 className="text-xl font-semibold">相關筆記</h2>
                  <span className="text-sm text-gray-500">
                    ({result.relevantNotes.length})
                  </span>
                  <div className="ml-auto flex items-center gap-1 text-xs text-gray-500">
                    <TrendingUp className="size-3" />
                    按相似度排序
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {result.relevantNotes.map((note) => (
                    <KnowledgeDiscoveryCard
                      key={note.id}
                      note={note}
                      onClick={() => handleNoteClick(note)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Related Notes */}
            {result.relatedNotes.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Network className="size-5 text-green-400" />
                  <h2 className="text-xl font-semibold">關聯筆記</h2>
                  <span className="text-sm text-gray-500">
                    ({result.relatedNotes.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {result.relatedNotes.map((relatedNote, index) => (
                    <RelatedNoteCard
                      key={index}
                      relatedNote={relatedNote}
                      onClick={() => handleNoteClick(relatedNote.note)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Background Decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>
    </div>
  );
}