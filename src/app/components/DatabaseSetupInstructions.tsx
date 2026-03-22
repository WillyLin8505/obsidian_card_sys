import { ExternalLink, Copy, CheckCircle } from 'lucide-react';
import { Button } from './ui/button';
import { useState } from 'react';

export function DatabaseSetupInstructions() {
  const [copied, setCopied] = useState(false);

  const sqlUrl = 'https://supabase.com/dashboard/project/hhomwbsgcimvlgdbtbis/sql';

  const handleCopyInstructions = () => {
    const instructions = `
1. 打開 Supabase SQL 編輯器
2. 複製 /supabase/migrations/001_knowledge_base_schema.sql 檔案的內容
3. 貼到 SQL 編輯器並執行
4. 等待執行完成
5. 重新整理此頁面
    `.trim();
    
    navigator.clipboard.writeText(instructions);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <svg className="size-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-yellow-900 mb-2">
            需要設定資料庫
          </h3>
          <p className="text-sm text-yellow-800 mb-4">
            在使用 Supabase 資料庫功能前，您需要先執行 SQL 遷移腳本來創建資料表。
          </p>
          
          <div className="space-y-3">
            <div className="bg-white rounded-lg p-4 border border-yellow-300">
              <p className="font-semibold text-sm mb-2">執行步驟：</p>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                <li>
                  點擊下方按鈕打開 Supabase SQL 編輯器
                </li>
                <li>
                  在專案的 <code className="bg-gray-100 px-2 py-1 rounded">/supabase/migrations/001_knowledge_base_schema.sql</code> 檔案中，複製所有 SQL 內容
                </li>
                <li>
                  貼到 Supabase SQL 編輯器中
                </li>
                <li>
                  點擊 "Run" 按鈕執行 SQL
                </li>
                <li>
                  等待執行完成（可能需要幾秒鐘）
                </li>
                <li>
                  返回此頁面，點擊「檢查資料庫狀態」
                </li>
              </ol>
            </div>

            <div className="flex gap-2">
              <a
                href={sqlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
              >
                <ExternalLink className="size-4" />
                打開 SQL 編輯器
              </a>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyInstructions}
                className="flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <CheckCircle className="size-4" />
                    已複製
                  </>
                ) : (
                  <>
                    <Copy className="size-4" />
                    複製步驟
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="mt-4 bg-blue-50 border border-blue-200 rounded p-3">
            <p className="text-xs text-blue-800">
              <strong>提示：</strong> 執行 SQL 後，系統會創建以下資料表：notes, note_chunks, tags, entities, note_links 等。
              這些表格將支援筆記管理、標籤系統、筆記連結和未來的 AI 功能。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}