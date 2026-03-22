import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { api } from '../utils/api';
import { storage } from '../utils/storage';

type TestStatus = 'pending' | 'running' | 'passed' | 'failed';

interface TestResult {
  name: string;
  status: TestStatus;
  message: string;
  details?: any;
}

export function DiagnosticTest() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const updateResult = (name: string, status: TestStatus, message: string, details?: any) => {
    setResults(prev => {
      const filtered = prev.filter(r => r.name !== name);
      return [...filtered, { name, status, message, details }];
    });
  };

  const runTests = async () => {
    setIsRunning(true);
    setResults([]);

    // Test 1: Database Connection
    updateResult('database-connection', 'running', '檢查資料庫連接...');
    try {
      const testResult = await api.test();
      if (testResult.success) {
        updateResult('database-connection', 'passed', '資料庫連接成功', testResult);
      } else {
        updateResult('database-connection', 'failed', testResult.error || '資料庫連接失敗', testResult);
      }
    } catch (error: any) {
      updateResult('database-connection', 'failed', `連接錯誤: ${error.message}`, error);
    }

    // Test 2: Fetch All Notes
    updateResult('fetch-notes', 'running', '獲取所有筆記...');
    try {
      const notes = await api.notes.getAll();
      updateResult('fetch-notes', 'passed', `成功獲取 ${notes.length} 個筆記`, { count: notes.length, notes });
    } catch (error: any) {
      updateResult('fetch-notes', 'failed', `獲取筆記失敗: ${error.message}`, error);
    }

    // Test 3: Create Note
    updateResult('create-note', 'running', '創建測試筆記...');
    try {
      const testNote = {
        title: '測試筆記 - ' + new Date().toISOString(),
        content: '# 測試內容\n\n這是一個自動創建的測試筆記。',
        type: 'fleet' as const,
        tags: ['測試', '診斷'],
      };
      const createdNote = await api.notes.create(testNote);
      updateResult('create-note', 'passed', `筆記創建成功，ID: ${createdNote.id}`, createdNote);

      // Test 4: Get Note by ID
      updateResult('get-note-by-id', 'running', '獲取單個筆記...');
      try {
        const fetchedNote = await api.notes.getById(createdNote.id);
        if (fetchedNote.id === createdNote.id && fetchedNote.title === testNote.title) {
          updateResult('get-note-by-id', 'passed', '成功獲取筆記', fetchedNote);
        } else {
          updateResult('get-note-by-id', 'failed', '筆記數據不匹配', { expected: createdNote, got: fetchedNote });
        }
      } catch (error: any) {
        updateResult('get-note-by-id', 'failed', `獲取筆記失敗: ${error.message}`, error);
      }

      // Test 5: Update Note
      updateResult('update-note', 'running', '更新筆記...');
      try {
        const updatedNote = await api.notes.update(createdNote.id, {
          title: '測試筆記（已更新） - ' + new Date().toISOString(),
          content: '# 更新後的內容\n\n這是更新後的內容。',
        });
        updateResult('update-note', 'passed', '筆記更新成功', updatedNote);
      } catch (error: any) {
        updateResult('update-note', 'failed', `更新筆記失敗: ${error.message}`, error);
      }

      // Test 6: Create Link
      updateResult('create-link', 'running', '創建筆記連結...');
      try {
        const secondNote = await api.notes.create({
          title: '第二個測試筆記',
          content: '# 內容',
          type: 'permanent' as const,
          tags: [],
        });

        const link = await api.links.create(createdNote.id, secondNote.id);
        updateResult('create-link', 'passed', '連結創建成功', link);

        // Clean up second note
        await api.notes.delete(secondNote.id);
      } catch (error: any) {
        updateResult('create-link', 'failed', `創建連結失敗: ${error.message}`, error);
      }

      // Test 7: Search Notes
      updateResult('search-notes', 'running', '搜尋筆記...');
      try {
        const searchResults = await api.notes.search('測試');
        updateResult('search-notes', 'passed', `搜尋成功，找到 ${searchResults.length} 個結果`, searchResults);
      } catch (error: any) {
        updateResult('search-notes', 'failed', `搜尋失敗: ${error.message}`, error);
      }

      // Test 8: Delete Note
      updateResult('delete-note', 'running', '刪除測試筆記...');
      try {
        await api.notes.delete(createdNote.id);
        updateResult('delete-note', 'passed', '筆記刪除成功');
      } catch (error: any) {
        updateResult('delete-note', 'failed', `刪除筆記失敗: ${error.message}`, error);
      }

    } catch (error: any) {
      updateResult('create-note', 'failed', `創建筆記失敗: ${error.message}`, error);
    }

    // Test 9: UUID Format Validation
    updateResult('uuid-validation', 'running', '驗證 UUID 格式...');
    try {
      const notes = await api.notes.getAll();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const invalidIds = notes.filter(note => !uuidRegex.test(note.id));
      
      if (invalidIds.length === 0) {
        updateResult('uuid-validation', 'passed', '所有筆記 ID 都是有效的 UUID v4 格式');
      } else {
        updateResult('uuid-validation', 'failed', `發現 ${invalidIds.length} 個無效的 UUID`, invalidIds);
      }
    } catch (error: any) {
      updateResult('uuid-validation', 'failed', `UUID 驗證失敗: ${error.message}`, error);
    }

    setIsRunning(false);
  };

  const getStatusIcon = (status: TestStatus) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="size-5 text-green-600" />;
      case 'failed':
        return <XCircle className="size-5 text-red-600" />;
      case 'running':
        return <Clock className="size-5 text-blue-600 animate-spin" />;
      default:
        return <AlertCircle className="size-5 text-gray-400" />;
    }
  };

  const passedCount = results.filter(r => r.status === 'passed').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const totalCount = results.length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="mb-2">系統診斷測試</h1>
        <p className="text-gray-600">
          運行完整的系統測試，檢查所有核心功能是否正常運作
        </p>
      </div>

      <div className="mb-6">
        <Button 
          onClick={runTests} 
          disabled={isRunning}
          className="w-full"
          size="lg"
        >
          {isRunning ? '測試進行中...' : '開始測試'}
        </Button>
      </div>

      {results.length > 0 && (
        <>
          <Card className="p-4 mb-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{totalCount}</div>
                <div className="text-sm text-gray-600">總測試數</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{passedCount}</div>
                <div className="text-sm text-gray-600">通過</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{failedCount}</div>
                <div className="text-sm text-gray-600">失敗</div>
              </div>
            </div>
          </Card>

          <div className="space-y-3">
            {results
              .sort((a, b) => {
                const order = { running: 0, failed: 1, passed: 2, pending: 3 };
                return order[a.status] - order[b.status];
              })
              .map((result, index) => (
                <Card key={result.name} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getStatusIcon(result.status)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-medium mb-1">{result.name}</div>
                      <div className={`text-sm ${
                        result.status === 'passed' ? 'text-green-700' :
                        result.status === 'failed' ? 'text-red-700' :
                        result.status === 'running' ? 'text-blue-700' :
                        'text-gray-600'
                      }`}>
                        {result.message}
                      </div>
                      
                      {result.details && (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                            查看詳細信息
                          </summary>
                          <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                            {JSON.stringify(result.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
          </div>
        </>
      )}

      {!isRunning && results.length === 0 && (
        <Card className="p-12 text-center text-gray-500">
          點擊上方按鈕開始測試
        </Card>
      )}
    </div>
  );
}
