import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Database, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { projectId, publicAnonKey } from '/utils/supabase/info';

export function DatabaseStatus() {
  const [status, setStatus] = useState<'checking' | 'healthy' | 'error'>('checking');
  const [message, setMessage] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  const checkDatabase = async () => {
    setStatus('checking');
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc3187a2/init/check`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      const result = await response.json();
      
      if (result.healthy) {
        setStatus('healthy');
        setMessage(result.message);
        setShowDetails(false);
      } else {
        setStatus('error');
        setMessage(result.error || 'Database schema not initialized');
        setShowDetails(true);
      }
    } catch (error) {
      setStatus('error');
      setMessage('Failed to connect to database');
      setShowDetails(true);
    }
  };

  const resetDatabase = async () => {
    if (!confirm('確定要重置資料庫嗎？這將刪除所有現有資料！')) {
      return;
    }

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-fc3187a2/init/reset`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      const result = await response.json();
      
      if (result.success) {
        alert('資料庫已重置成功！');
        await checkDatabase();
      } else {
        alert('重置失敗：' + result.error);
      }
    } catch (error) {
      alert('重置失敗：' + error);
    }
  };

  useEffect(() => {
    checkDatabase();
  }, []);

  if (status === 'checking') {
    return (
      <div className="fixed bottom-4 right-4 bg-blue-50 border border-blue-200 rounded-lg p-4 shadow-lg max-w-md">
        <div className="flex items-center gap-3">
          <RefreshCw className="size-5 text-blue-600 animate-spin" />
          <span className="text-sm text-blue-900">檢查資料庫狀態...</span>
        </div>
      </div>
    );
  }

  if (status === 'healthy' && !showDetails) {
    return null; // Don't show anything if everything is fine
  }

  return (
    <div className={`fixed bottom-4 right-4 rounded-lg p-4 shadow-lg max-w-md ${
      status === 'error' ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
    }`}>
      <div className="flex items-start gap-3">
        {status === 'error' ? (
          <AlertCircle className="size-5 text-red-600 flex-shrink-0 mt-0.5" />
        ) : (
          <CheckCircle className="size-5 text-green-600 flex-shrink-0 mt-0.5" />
        )}
        
        <div className="flex-1">
          <h3 className={`font-medium mb-1 ${
            status === 'error' ? 'text-red-900' : 'text-green-900'
          }`}>
            {status === 'error' ? '資料庫未初始化' : '資料庫運行正常'}
          </h3>
          
          <p className={`text-sm mb-3 ${
            status === 'error' ? 'text-red-700' : 'text-green-700'
          }`}>
            {message}
          </p>

          {status === 'error' && (
            <>
              <div className="bg-white rounded p-3 mb-3 text-sm">
                <p className="font-medium mb-2">請按照以下步驟初始化資料庫：</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>開啟 Supabase Dashboard</li>
                  <li>進入 SQL Editor</li>
                  <li>複製並執行檔案：<code className="bg-gray-100 px-1 rounded">/supabase/migrations/001_knowledge_base_schema.sql</code></li>
                  <li>執行完成後點擊下方的「重新檢查」按鈕</li>
                </ol>
              </div>
              
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={checkDatabase}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="size-3" />
                  重新檢查
                </Button>
                
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={resetDatabase}
                  className="flex items-center gap-2"
                >
                  <Database className="size-3" />
                  清空資料庫
                </Button>
                
                <a
                  href={`https://supabase.com/dashboard/project/${projectId}/sql`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto"
                >
                  <Button size="sm">
                    開啟 SQL Editor
                  </Button>
                </a>
              </div>
            </>
          )}
        </div>
        
        {status === 'healthy' && (
          <button
            onClick={() => setShowDetails(false)}
            className="text-green-600 hover:text-green-800"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
