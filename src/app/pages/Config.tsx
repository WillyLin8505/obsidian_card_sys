import { useState, useEffect } from 'react';
import { storage } from '../utils/storage';
import { api, localApi } from '../utils/api';
import { Config as ConfigType, DataSource } from '../types/note';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Save, FolderOpen, FileText, BookOpen, Lightbulb, Database, Download, CheckCircle, XCircle, AlertCircle, RefreshCw, Eye, Wifi } from 'lucide-react';
import { toast } from 'sonner';
import { migrateToDatabase, downloadBackup } from '../utils/migrate';
import { DatabaseSetupInstructions } from '../components/DatabaseSetupInstructions';
import { useNavigate } from 'react-router';

export function Config() {
  const [config, setConfig] = useState<ConfigType>(storage.getConfig());
  const [notePath, setNotePath] = useState(config.notePath);
  const [fleetNoteTemplate, setFleetNoteTemplate] = useState(config.fleetNoteTemplate);
  const [permanentNoteTemplate, setPermanentNoteTemplate] = useState(config.permanentNoteTemplate);
  const [sourceNoteTemplate, setSourceNoteTemplate] = useState(config.sourceNoteTemplate);
  const [dataSource, setDataSource] = useState<DataSource>(config.dataSource || 'supabase');
  const [obsidianBackendUrl, setObsidianBackendUrl] = useState(config.obsidianBackendUrl || 'http://localhost:3001');
  const [fleetNoteTagsInput, setFleetNoteTagsInput] = useState((config.fleetNoteTags || []).join(', '));
  const [sourceNoteTagsInput, setSourceNoteTagsInput] = useState((config.sourceNoteTags || []).join(', '));
  const [isMigrating, setIsMigrating] = useState(false);
  const [dbStatus, setDbStatus] = useState<{ success: boolean; message: string; hint?: string } | null>(null);
  const [isCheckingDb, setIsCheckingDb] = useState(false);
  const [localStatus, setLocalStatus] = useState<{ ok: boolean; qmd: { ok: boolean; message: string }; claude: { ok: boolean; message: string } } | null>(null);
  const [isCheckingLocal, setIsCheckingLocal] = useState(false);

  useEffect(() => {
    setNotePath(config.notePath);
    setFleetNoteTemplate(config.fleetNoteTemplate);
    setPermanentNoteTemplate(config.permanentNoteTemplate);
    setSourceNoteTemplate(config.sourceNoteTemplate);
    checkDatabaseStatus();
  }, [config]);

  const checkDatabaseStatus = async () => {
    setIsCheckingDb(true);
    try {
      const result = await api.test();
      setDbStatus(result);
    } catch (error: any) {
      setDbStatus({
        success: false,
        message: error.message,
        hint: '請先在 Supabase 控制台執行 SQL 遷移腳本',
      });
    } finally {
      setIsCheckingDb(false);
    }
  };

  const handleSave = () => {
    const parseTags = (input: string) =>
      input.split(',').map(t => t.trim()).filter(Boolean);

    const newConfig: ConfigType = {
      notePath,
      fleetNoteTemplate,
      permanentNoteTemplate,
      sourceNoteTemplate,
      dataSource,
      obsidianBackendUrl: obsidianBackendUrl.trim() || 'http://localhost:3001',
      fleetNoteTags: parseTags(fleetNoteTagsInput),
      sourceNoteTags: parseTags(sourceNoteTagsInput),
    };

    storage.saveConfig(newConfig);
    setConfig(newConfig);
    toast.success('設定已儲存');
  };

  const checkLocalServer = async () => {
    setIsCheckingLocal(true);
    setLocalStatus(null);
    try {
      const result = await localApi.health();
      setLocalStatus(result);
    } catch (err: any) {
      setLocalStatus({
        ok: false,
        qmd: { ok: false, message: '無法連接到本地伺服器' },
        claude: { ok: false, message: err.message || '連線失敗' },
      });
    } finally {
      setIsCheckingLocal(false);
    }
  };

  const handleMigrate = async () => {
    if (!confirm('確定要將 localStorage 中的筆記遷移到 Supabase 資料庫嗎？建議先下載備份。')) {
      return;
    }

    setIsMigrating(true);
    try {
      const result = await migrateToDatabase();
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      toast.error(`遷移失敗：${error.message}`);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleDownloadBackup = () => {
    downloadBackup();
    toast.success('備份已下載');
  };

  const resetFleetTemplate = () => {
    const defaultTemplate = `# Note

# Question 

# personal connection or purpose

# TO DO step 

# others &  Reference`;
    setFleetNoteTemplate(defaultTemplate);
  };

  const resetPermanentTemplate = () => {
    const defaultTemplate = `# Note

# Question 

# personal connection or purpose

# TO DO step 

# others &  Reference`;
    setPermanentNoteTemplate(defaultTemplate);
  };

  const resetSourceTemplate = () => {
    const defaultTemplate = '# Source Note\n\n## 來源資訊\n- 作者：\n- 標題：\n- 連結：\n\n## 重點摘要\n\n## 個人想法\n\n## 標籤\n\n';
    setSourceNoteTemplate(defaultTemplate);
  };

  const navigate = useNavigate();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="mb-2">設定</h1>
        <p className="text-gray-600">配置您的筆記系統</p>
      </div>

      <div className="space-y-8">
        {/* Data Source Selector */}
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Database className="size-5 text-gray-600" />
            <h2>資料來源</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">選擇筆記資料的儲存來源。切換後請儲存設定，重新整理頁面生效。</p>
          <div className="flex flex-col gap-3">
            {([
              { value: 'supabase', label: 'Supabase（雲端）', desc: '使用遠端 Supabase 資料庫' },
              { value: 'obsidian', label: 'Obsidian 本機 Vault', desc: '透過本地後端伺服器讀取 QMD 語意搜尋' },
              { value: 'local', label: 'Local Storage（瀏覽器）', desc: '僅存在瀏覽器 localStorage，不同裝置無法共用' },
            ] as { value: DataSource; label: string; desc: string }[]).map(({ value, label, desc }) => (
              <label
                key={value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  dataSource === value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="dataSource"
                  value={value}
                  checked={dataSource === value}
                  onChange={() => setDataSource(value)}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Path Configuration */}
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen className="size-5 text-gray-600" />
            <h2>筆記路徑</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-2">
                {dataSource === 'obsidian' ? 'Obsidian Vault 路徑' : '筆記儲存路徑'}
              </label>
              <Input
                value={notePath}
                onChange={(e) => setNotePath(e.target.value)}
                placeholder={dataSource === 'obsidian' ? '例如: /home/user/obsidian-vault 或 D:\\obsidian\\vault' : '例如: ~/Documents/Notes'}
              />
              <p className="text-sm text-gray-500 mt-2">
                {dataSource === 'obsidian'
                  ? <span>你的 Obsidian Vault 所在位置。設定後需在 WSL 執行：<br /><code className="bg-gray-100 px-1 rounded">qmd collection add {notePath || '<vault路徑>'} --name obsidian && qmd embed</code></span>
                  : '設定您的 Markdown 檔案儲存位置'
                }
              </p>
            </div>
          </div>
        </div>

        {/* Fleet Note Template Configuration */}
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="size-5 text-gray-600" />
            <h2>閃念筆記模板</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-2">
                新增閃念筆記時自動加入的 Tags
              </label>
              <Input
                value={fleetNoteTagsInput}
                onChange={(e) => setFleetNoteTagsInput(e.target.value)}
                placeholder="例如: 靈感, 待處理, inbox（用逗號分隔）"
              />
              <p className="text-sm text-gray-500 mt-1">
                用逗號分隔多個 tag，建立新閃念筆記時會自動套用
              </p>
            </div>

            <div>
              <label className="block text-sm mb-2">
                閃念筆記預設模板
              </label>
              <Textarea
                value={fleetNoteTemplate}
                onChange={(e) => setFleetNoteTemplate(e.target.value)}
                placeholder="輸入閃念筆記的預設內容（支援 Markdown）"
                rows={12}
                className="font-mono"
              />
              <p className="text-sm text-gray-500 mt-2">
                閃念筆記用於快速記錄想法和靈感，這個模板會在創建閃念筆記時自動套用
              </p>
            </div>

            <Button
              variant="outline"
              onClick={resetFleetTemplate}
              className="mt-2"
            >
              重置為預設模板
            </Button>
          </div>
        </div>

        {/* Permanent Note Template Configuration */}
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="size-5 text-gray-600" />
            <h2>永久筆記模板</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-2">
                永久筆記預設模板
              </label>
              <Textarea
                value={permanentNoteTemplate}
                onChange={(e) => setPermanentNoteTemplate(e.target.value)}
                placeholder="輸入永久筆記的預設內容（支援 Markdown）"
                rows={12}
                className="font-mono"
              />
              <p className="text-sm text-gray-500 mt-2">
                永久筆記是經過深思熟慮的知識結晶，這個模板會在創建永久筆記時自動套用
              </p>
            </div>
            
            <Button
              variant="outline"
              onClick={resetPermanentTemplate}
              className="mt-2"
            >
              重置為預設模板
            </Button>
          </div>
        </div>

        {/* Source Note Template Configuration */}
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="size-5 text-gray-600" />
            <h2>文獻筆記模板</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-2">
                新增文獻筆記時自動加入的 Tags
              </label>
              <Input
                value={sourceNoteTagsInput}
                onChange={(e) => setSourceNoteTagsInput(e.target.value)}
                placeholder="例如: 文獻, 閱讀, 待整理（用逗號分隔）"
              />
              <p className="text-sm text-gray-500 mt-1">
                用逗號分隔多個 tag，建立新文獻筆記時會自動套用
              </p>
            </div>

            <div>
              <label className="block text-sm mb-2">
                文獻筆記預設模板
              </label>
              <Textarea
                value={sourceNoteTemplate}
                onChange={(e) => setSourceNoteTemplate(e.target.value)}
                placeholder="輸入文獻筆記的預設內容（支援 Markdown）"
                rows={14}
                className="font-mono"
              />
              <p className="text-sm text-gray-500 mt-2">
                文獻筆記用於記錄外部來源的內容和想法，這個模板會在創建文獻筆記時自動套用
              </p>
            </div>

            <Button
              variant="outline"
              onClick={resetSourceTemplate}
              className="mt-2"
            >
              重置為預設模板
            </Button>
          </div>
        </div>

        {/* Storage Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="mb-2">儲存資訊</h3>
          <p className="text-sm text-gray-700">
            目前所有筆記資料都儲存在瀏覽器的 localStorage 中。
            請注意，清除瀏覽器資料可能會導致筆記遺失。
          </p>
          <p className="text-sm text-gray-700 mt-2">
            建議定期匯出您的筆記以備份。
          </p>
        </div>

        {/* Migration and Backup */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3>資料庫狀態與備份</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={checkDatabaseStatus}
              disabled={isCheckingDb}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`size-4 ${isCheckingDb ? 'animate-spin' : ''}`} />
              檢查資料庫狀態
            </Button>
          </div>

          {/* Database Status */}
          {dbStatus && (
            <div className="mb-4">
              {dbStatus.success ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="size-5" />
                    <div>
                      <p className="font-semibold">{dbStatus.message}</p>
                      <p className="text-sm mt-1">資料庫已就緒，可以使用所有功能</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start gap-2 text-red-700">
                      <XCircle className="size-5 mt-0.5" />
                      <div>
                        <p className="font-semibold">資料庫未設置</p>
                        <p className="text-sm mt-1">{dbStatus.message}</p>
                      </div>
                    </div>
                  </div>
                  <DatabaseSetupInstructions />
                </div>
              )}
            </div>
          )}

          {/* Backup and Migration Buttons */}
          <div>
            <p className="text-sm text-gray-700 mb-3">
              資料遷移與備份工具
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleDownloadBackup}
                className="flex items-center gap-2"
              >
                <Download className="size-4" />
                下載備份
              </Button>
              <Button
                variant="outline"
                onClick={handleMigrate}
                className="flex items-center gap-2"
                disabled={isMigrating || !dbStatus?.success}
              >
                <Database className="size-4" />
                {isMigrating ? '遷移中...' : '遷移到 Supabase'}
              </Button>
            </div>
            {!dbStatus?.success && (
              <p className="text-xs text-gray-500 mt-2">
                請先設置資料庫後才能使用遷移功能
              </p>
            )}
          </div>
        </div>

        {/* Local Obsidian Backend */}
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wifi className="size-5 text-gray-600" />
            <h2>本地 Obsidian 連線</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            設定本地後端伺服器的 URL（透過 Tailscale 可達），用於 QMD 語意搜尋。
            <br />
            啟動方式：進入 <code className="bg-gray-100 px-1 rounded">local-server/</code> 目錄，執行 <code className="bg-gray-100 px-1 rounded">CLAUDE_API_KEY=sk-ant-... node server.js</code>
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-2">Backend URL</label>
              <Input
                value={obsidianBackendUrl}
                onChange={(e) => setObsidianBackendUrl(e.target.value)}
                placeholder="http://localhost:3001 或 http://100.x.x.x:3001"
              />
              <p className="text-sm text-gray-500 mt-1">
                本機測試用 localhost，遠端透過 Tailscale IP
              </p>
            </div>

            <Button
              variant="outline"
              onClick={checkLocalServer}
              disabled={isCheckingLocal}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`size-4 ${isCheckingLocal ? 'animate-spin' : ''}`} />
              測試連線
            </Button>

            {localStatus && (
              <div className={`border rounded-lg p-4 space-y-2 ${localStatus.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2">
                  {localStatus.ok
                    ? <CheckCircle className="size-4 text-green-600" />
                    : <XCircle className="size-4 text-red-600" />}
                  <span className={`text-sm font-medium ${localStatus.ok ? 'text-green-700' : 'text-red-700'}`}>
                    {localStatus.ok ? '連線成功' : '連線失敗'}
                  </span>
                </div>
                <div className="text-sm space-y-1 ml-6">
                  <div className="flex items-center gap-2">
                    {localStatus.qmd.ok
                      ? <CheckCircle className="size-3 text-green-600" />
                      : <XCircle className="size-3 text-red-600" />}
                    <span className="text-gray-700">QMD: {localStatus.qmd.message}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {localStatus.claude.ok
                      ? <CheckCircle className="size-3 text-green-600" />
                      : <XCircle className="size-3 text-red-600" />}
                    <span className="text-gray-700">Claude API: {localStatus.claude.message}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end gap-2">
          <Button
            onClick={handleSave}
            className="flex items-center gap-2"
          >
            <Save className="size-4" />
            儲存設定
          </Button>
        </div>
      </div>
    </div>
  );
}