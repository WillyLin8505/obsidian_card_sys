import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Database, RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export function DataCheck() {
  const [loading, setLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [noteCount, setNoteCount] = useState(0);

  const checkData = async () => {
    setLoading(true);
    try {
      // 1. 測試資料庫連線
      const testResult = await api.test();
      setDbStatus(testResult);

      // 2. 獲取所有筆記
      const allNotes = await api.notes.getAll();
      setNotes(allNotes);
      setNoteCount(allNotes.length);

      toast.success('資料檢查完成');
    } catch (error: any) {
      console.error('資料檢查失敗:', error);
      toast.error(`檢查失敗: ${error.message}`);
      setDbStatus({ success: false, message: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkData();
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Supabase 資料檢查</h1>
          <p className="text-gray-600">檢查您的筆記是否已正確保存到 Supabase 資料庫</p>
        </div>
        <Button onClick={checkData} disabled={loading} className="flex items-center gap-2">
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          重新檢查
        </Button>
      </div>

      {/* 資料庫連線狀態 */}
      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Database className="size-5" />
          資料庫連線狀態
        </h2>
        {dbStatus ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {dbStatus.success ? (
                <CheckCircle className="size-5 text-green-500" />
              ) : (
                <XCircle className="size-5 text-red-500" />
              )}
              <span className={dbStatus.success ? 'text-green-700' : 'text-red-700'}>
                {dbStatus.message}
              </span>
            </div>
            {dbStatus.hint && (
              <div className="flex items-start gap-2 mt-2 p-3 bg-yellow-50 rounded-lg">
                <AlertCircle className="size-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-yellow-800">{dbStatus.hint}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-500">檢查中...</div>
        )}
      </Card>

      {/* 筆記統計 */}
      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">筆記統計</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-blue-700">{noteCount}</div>
            <div className="text-sm text-blue-600">總筆記數</div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-700">
              {notes.filter(n => n.type === 'fleet').length}
            </div>
            <div className="text-sm text-green-600">閃念筆記</div>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-purple-700">
              {notes.filter(n => n.type === 'source').length}
            </div>
            <div className="text-sm text-purple-600">文獻筆記</div>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-orange-700">
              {notes.filter(n => n.type === 'permanent').length}
            </div>
            <div className="text-sm text-orange-600">永久筆記</div>
          </div>
        </div>
      </Card>

      {/* 筆記列表 */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">所有筆記（前 20 筆）</h2>
        {notes.length > 0 ? (
          <div className="space-y-2">
            {notes.slice(0, 20).map((note, index) => (
              <div
                key={note.id}
                className="border rounded-lg p-4 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-semibold">
                      {index + 1}. {note.title}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      類型: {note.type === 'fleet' ? '閃念筆記' : note.type === 'source' ? '文獻筆記' : '永久筆記'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      ID: {note.id}
                    </div>
                    <div className="text-xs text-gray-500">
                      建立時間: {new Date(note.createdAt).toLocaleString('zh-TW')}
                    </div>
                    {note.tags && note.tags.length > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        標籤: {note.tags.join(', ')}
                      </div>
                    )}
                    {note.links && note.links.length > 0 && (
                      <div className="text-xs text-gray-500">
                        連結數: {note.links.length}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            沒有找到任何筆記
          </div>
        )}
      </Card>

      {/* 資料庫資訊 */}
      <Card className="p-6 mt-6 bg-gray-50">
        <h2 className="text-xl font-semibold mb-4">資料庫資訊</h2>
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium">API 端點:</span>{' '}
            <code className="bg-gray-200 px-2 py-1 rounded">
              /functions/v1/make-server-fc3187a2
            </code>
          </div>
          <div>
            <span className="font-medium">資料表:</span>
            <ul className="list-disc list-inside ml-4 mt-1">
              <li>notes_fc3187a2 - 筆記資料</li>
              <li>note_links_fc3187a2 - 筆記連結</li>
              <li>kv_store_fc3187a2 - 鍵值儲存</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
