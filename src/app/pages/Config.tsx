import { useState, useEffect } from 'react';
import { storage } from '../utils/storage';
import { api, localApi } from '../utils/api';
import { Config as ConfigType, DataSource, NoteTemplateConfig, MetadataField, CardFontSizes } from '../types/note';
import { parseFrontmatterKeys } from '../utils/frontmatter';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Save, FolderOpen, FileText, BookOpen, Lightbulb, Database, Download, CheckCircle, XCircle, AlertCircle, RefreshCw, Eye, Wifi, Tag, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { migrateToDatabase, downloadBackup } from '../utils/migrate';
import { DatabaseSetupInstructions } from '../components/DatabaseSetupInstructions';
import { useNavigate } from 'react-router';

export function Config() {
  const [config, setConfig] = useState<ConfigType>(storage.getConfig());
  const [notePath, setNotePath] = useState(config.notePath);
  const [sourceNoteSavePath, setSourceNoteSavePath] = useState(config.sourceNoteSavePath || '');
  const [fleetNoteTemplate, setFleetNoteTemplate] = useState<NoteTemplateConfig>(config.fleetNoteTemplate);
  const [permanentNoteTemplate, setPermanentNoteTemplate] = useState<NoteTemplateConfig>(config.permanentNoteTemplate);
  const [sourceNoteTemplate, setSourceNoteTemplate] = useState<NoteTemplateConfig>(config.sourceNoteTemplate);
  const [dataSource, setDataSource] = useState<DataSource>(config.dataSource || 'supabase');
  const [obsidianBackendUrl, setObsidianBackendUrl] = useState(config.obsidianBackendUrl || 'http://localhost:3001');
  const [localServerToken, setLocalServerToken] = useState(config.localServerToken || '');
  const [allowExternalAnalysis, setAllowExternalAnalysis] = useState(config.allowExternalAnalysis === true);
  const [fleetNoteTags, setFleetNoteTags] = useState<string[]>(config.fleetNoteTags || []);
  const [fleetTagInput, setFleetTagInput] = useState('');
  const [sourceNoteTags, setSourceNoteTags] = useState<string[]>(config.sourceNoteTags || []);
  const [sourceTagInput, setSourceTagInput] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);
  const [dbStatus, setDbStatus] = useState<{ success: boolean; message: string; hint?: string } | null>(null);
  const [isCheckingDb, setIsCheckingDb] = useState(false);
  const [localStatus, setLocalStatus] = useState<{ ok: boolean; qmd: { ok: boolean; message: string }; claude: { ok: boolean; message: string } } | null>(null);
  const [isCheckingLocal, setIsCheckingLocal] = useState(false);
  const [displayMetadataKeys, setDisplayMetadataKeys] = useState<string[]>(config.displayMetadataKeys || []);
  const [availableMetadataKeys, setAvailableMetadataKeys] = useState<string[]>([]);
  const [isScanningKeys, setIsScanningKeys] = useState(false);
  const DEFAULT_CARD_FONT_SIZES: CardFontSizes = { title: 18, h1: 16, h2: 14, h3: 13, h4: 12, body: 12, metadata: 11 };
  const [cardFontSizes, setCardFontSizes] = useState<CardFontSizes>({ ...DEFAULT_CARD_FONT_SIZES, ...(config.cardFontSizes || {}) });

  useEffect(() => {
    setNotePath(config.notePath);
    setSourceNoteSavePath(config.sourceNoteSavePath || '');
    setFleetNoteTemplate(config.fleetNoteTemplate);
    setPermanentNoteTemplate(config.permanentNoteTemplate);
    setSourceNoteTemplate(config.sourceNoteTemplate);
    setLocalServerToken(config.localServerToken || '');
    setAllowExternalAnalysis(config.allowExternalAnalysis === true);
    checkDatabaseStatus();
  }, [config]);

  useEffect(() => {
    const scanNotes = async () => {
      setIsScanningKeys(true);
      try {
        const notes = await storage.getNotes();
        const keySet = new Set<string>();
        for (const note of notes) {
          for (const key of parseFrontmatterKeys(note.content)) {
            keySet.add(key);
          }
        }
        setAvailableMetadataKeys([...keySet].sort());
      } finally {
        setIsScanningKeys(false);
      }
    };
    scanNotes();
  }, []);

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
    const newConfig: ConfigType = {
      notePath,
      sourceNoteSavePath: sourceNoteSavePath.trim() || undefined,
      fleetNoteTemplate,
      permanentNoteTemplate,
      sourceNoteTemplate,
      dataSource,
      obsidianBackendUrl: obsidianBackendUrl.trim() || 'http://localhost:3001',
      localServerToken: localServerToken.trim() || undefined,
      allowExternalAnalysis,
      fleetNoteTags,
      sourceNoteTags,
      displayMetadataKeys,
      fontSize: 12,
      cardFontSizes,
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

  const resetFleetTemplate = () => setFleetNoteTemplate(storage.getConfig().fleetNoteTemplate);
  const resetPermanentTemplate = () => setPermanentNoteTemplate(storage.getConfig().permanentNoteTemplate);
  const resetSourceTemplate = () => setSourceNoteTemplate(storage.getConfig().sourceNoteTemplate);

  const updateMetadataField = (
    setter: React.Dispatch<React.SetStateAction<NoteTemplateConfig>>,
    index: number,
    patch: Partial<MetadataField>
  ) => {
    setter(prev => ({
      ...prev,
      metadataFields: prev.metadataFields.map((f, i) => i === index ? { ...f, ...patch } : f),
    }));
  };

  const addMetadataField = (setter: React.Dispatch<React.SetStateAction<NoteTemplateConfig>>) => {
    setter(prev => ({
      ...prev,
      metadataFields: [...prev.metadataFields, { key: '', defaultValue: '' }],
    }));
  };

  const removeMetadataField = (setter: React.Dispatch<React.SetStateAction<NoteTemplateConfig>>, index: number) => {
    setter(prev => ({
      ...prev,
      metadataFields: prev.metadataFields.filter((_, i) => i !== index),
    }));
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

        {/* Font Sizes */}
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="size-5 text-gray-600" />
            <h2>字體大小設定</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">分別設定筆記卡片各層級的字體大小</p>
          <div className="space-y-4">
            {([
              { key: 'title' as keyof CardFontSizes, label: '卡片標題', sample: '筆記名稱' },
              { key: 'h1'    as keyof CardFontSizes, label: '# 一級標題', sample: '# 大標題' },
              { key: 'h2'    as keyof CardFontSizes, label: '## 二級標題', sample: '## 中標題' },
              { key: 'h3'    as keyof CardFontSizes, label: '### 三級標題', sample: '### 小標題' },
              { key: 'h4'    as keyof CardFontSizes, label: '#### 四級標題', sample: '#### 細標題' },
              { key: 'body'  as keyof CardFontSizes, label: '內文', sample: '正文段落文字' },
              { key: 'metadata' as keyof CardFontSizes, label: 'Metadata / Tags', sample: '#tag  key: value' },
            ] as { key: keyof CardFontSizes; label: string; sample: string }[]).map(({ key, label, sample }) => (
              <div key={key} className="flex items-center gap-4">
                <span className="text-sm text-gray-600 w-36 shrink-0">{label}</span>
                <input
                  type="range"
                  min={8}
                  max={28}
                  step={1}
                  value={cardFontSizes[key]}
                  onChange={e => setCardFontSizes(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                  className="flex-1"
                />
                <span className="text-gray-400 w-10 text-right text-sm">{cardFontSizes[key]}px</span>
                <span className="text-gray-500 w-32 shrink-0" style={{ fontSize: `${cardFontSizes[key]}px` }}>{sample}</span>
              </div>
            ))}
          </div>
          <button
            className="mt-4 text-xs text-gray-400 underline hover:text-gray-600"
            onClick={() => setCardFontSizes({ title: 18, h1: 16, h2: 14, h3: 13, h4: 12, body: 12, metadata: 11 })}
          >
            重置為預設值
          </button>
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

            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-1">
                <BookOpen className="size-4 text-green-600" />
                文獻筆記存檔路徑
              </label>
              <Input
                value={sourceNoteSavePath}
                onChange={(e) => setSourceNoteSavePath(e.target.value)}
                placeholder="例如: D:\obsidian\Willy_2026\Sources\others"
              />
              <p className="text-sm text-gray-500 mt-2">
                抓取網址建立的文獻筆記，會同步儲存為 .md 檔案到此路徑。需先啟動本地後端伺服器。留空則不儲存到本機。
              </p>
            </div>
          </div>
        </div>

        {/* Default Tags Configuration */}
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="size-5 text-gray-600" />
            <h2>預設 Tags 設定</h2>
          </div>
          <p className="text-sm text-gray-600 mb-6">設定建立新筆記時自動套用的 tags</p>

          <div className="space-y-6">
            {/* Fleet Note Tags */}
            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-1">
                <Lightbulb className="size-4 text-yellow-500" />
                靈感筆記預設 Tags
              </label>
              <div className="flex flex-wrap gap-2 mb-2 min-h-[36px]">
                {fleetNoteTags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm"
                  >
                    #{tag}
                    <button
                      onClick={() => setFleetNoteTags(prev => prev.filter(t => t !== tag))}
                      className="hover:text-yellow-600 ml-1"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {fleetNoteTags.length === 0 && (
                  <span className="text-sm text-gray-400">尚未設定預設 tags</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={fleetTagInput}
                  onChange={(e) => setFleetTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && fleetTagInput.trim()) {
                      const tag = fleetTagInput.trim();
                      if (!fleetNoteTags.includes(tag)) {
                        setFleetNoteTags(prev => [...prev, tag]);
                      }
                      setFleetTagInput('');
                    }
                  }}
                  placeholder="輸入 tag 後按 Enter 新增"
                  className="max-w-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const tag = fleetTagInput.trim();
                    if (tag && !fleetNoteTags.includes(tag)) {
                      setFleetNoteTags(prev => [...prev, tag]);
                    }
                    setFleetTagInput('');
                  }}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            {/* Source Note Tags */}
            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-1">
                <BookOpen className="size-4 text-blue-500" />
                文獻筆記預設 Tags
              </label>
              <div className="flex flex-wrap gap-2 mb-2 min-h-[36px]">
                {sourceNoteTags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                  >
                    #{tag}
                    <button
                      onClick={() => setSourceNoteTags(prev => prev.filter(t => t !== tag))}
                      className="hover:text-blue-600 ml-1"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {sourceNoteTags.length === 0 && (
                  <span className="text-sm text-gray-400">尚未設定預設 tags</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={sourceTagInput}
                  onChange={(e) => setSourceTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && sourceTagInput.trim()) {
                      const tag = sourceTagInput.trim();
                      if (!sourceNoteTags.includes(tag)) {
                        setSourceNoteTags(prev => [...prev, tag]);
                      }
                      setSourceTagInput('');
                    }
                  }}
                  placeholder="輸入 tag 後按 Enter 新增"
                  className="max-w-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const tag = sourceTagInput.trim();
                    if (tag && !sourceNoteTags.includes(tag)) {
                      setSourceNoteTags(prev => [...prev, tag]);
                    }
                    setSourceTagInput('');
                  }}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
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
              <label className="block text-sm font-medium mb-2">Metadata 欄位</label>
              <div className="space-y-2">
                {fleetNoteTemplate.metadataFields.map((field, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input value={field.key} onChange={e => updateMetadataField(setFleetNoteTemplate, i, { key: e.target.value })} placeholder="欄位名稱" className="w-36 font-mono text-sm" />
                    <span className="text-gray-400">:</span>
                    <Input value={field.defaultValue} onChange={e => updateMetadataField(setFleetNoteTemplate, i, { defaultValue: e.target.value })} placeholder="預設值（tags 用逗號分隔）" className="flex-1 font-mono text-sm" />
                    <Button variant="ghost" size="sm" onClick={() => removeMetadataField(setFleetNoteTemplate, i)}><X className="size-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => addMetadataField(setFleetNoteTemplate)} className="mt-1"><Plus className="size-4 mr-1" />新增欄位</Button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">模板內文</label>
              <Textarea value={fleetNoteTemplate.bodyTemplate} onChange={e => setFleetNoteTemplate(prev => ({ ...prev, bodyTemplate: e.target.value }))} placeholder="輸入閃念筆記的預設內容（支援 Markdown）" rows={8} className="font-mono" />
            </div>
            <Button variant="outline" onClick={resetFleetTemplate} className="mt-2">重置為預設模板</Button>
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
              <label className="block text-sm font-medium mb-2">Metadata 欄位</label>
              <div className="space-y-2">
                {permanentNoteTemplate.metadataFields.map((field, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input value={field.key} onChange={e => updateMetadataField(setPermanentNoteTemplate, i, { key: e.target.value })} placeholder="欄位名稱" className="w-36 font-mono text-sm" />
                    <span className="text-gray-400">:</span>
                    <Input value={field.defaultValue} onChange={e => updateMetadataField(setPermanentNoteTemplate, i, { defaultValue: e.target.value })} placeholder="預設值（tags 用逗號分隔）" className="flex-1 font-mono text-sm" />
                    <Button variant="ghost" size="sm" onClick={() => removeMetadataField(setPermanentNoteTemplate, i)}><X className="size-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => addMetadataField(setPermanentNoteTemplate)} className="mt-1"><Plus className="size-4 mr-1" />新增欄位</Button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">模板內文</label>
              <Textarea value={permanentNoteTemplate.bodyTemplate} onChange={e => setPermanentNoteTemplate(prev => ({ ...prev, bodyTemplate: e.target.value }))} placeholder="輸入永久筆記的預設內容（支援 Markdown）" rows={8} className="font-mono" />
            </div>
            <Button variant="outline" onClick={resetPermanentTemplate} className="mt-2">重置為預設模板</Button>
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
              <label className="block text-sm font-medium mb-2">Metadata 欄位</label>
              <div className="space-y-2">
                {sourceNoteTemplate.metadataFields.map((field, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input value={field.key} onChange={e => updateMetadataField(setSourceNoteTemplate, i, { key: e.target.value })} placeholder="欄位名稱" className="w-36 font-mono text-sm" />
                    <span className="text-gray-400">:</span>
                    <Input value={field.defaultValue} onChange={e => updateMetadataField(setSourceNoteTemplate, i, { defaultValue: e.target.value })} placeholder="預設值（tags 用逗號分隔）" className="flex-1 font-mono text-sm" />
                    <Button variant="ghost" size="sm" onClick={() => removeMetadataField(setSourceNoteTemplate, i)}><X className="size-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => addMetadataField(setSourceNoteTemplate)} className="mt-1"><Plus className="size-4 mr-1" />新增欄位</Button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">模板內文</label>
              <Textarea value={sourceNoteTemplate.bodyTemplate} onChange={e => setSourceNoteTemplate(prev => ({ ...prev, bodyTemplate: e.target.value }))} placeholder="輸入文獻筆記的預設內容（支援 Markdown）" rows={10} className="font-mono" />
            </div>
            <Button variant="outline" onClick={resetSourceTemplate} className="mt-2">重置為預設模板</Button>
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
            設定本地後端伺服器的 URL（透過 Tailscale 可達），用於 QMD 語意搜尋與文獻筆記 AI 分析。
            <br />
            啟動方式：進入 <code className="bg-gray-100 px-1 rounded">local-server/</code> 目錄，執行 <code className="bg-gray-100 px-1 rounded">node server.js</code>
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

            <div>
              <label className="block text-sm mb-2">Local Server Token</label>
              <Input
                type="password"
                value={localServerToken}
                onChange={(e) => setLocalServerToken(e.target.value)}
                placeholder="與 LOCAL_SERVER_TOKEN 相同"
              />
              <p className="text-sm text-gray-500 mt-1">
                若後端設定了 LOCAL_SERVER_TOKEN，這裡需填入相同 token。Claude API Key 請放在 local-server 的 .env，不會再從前端傳送。
              </p>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div>
                <p className="text-sm font-medium text-amber-900">允許外部網址/AI 分析</p>
                <p className="text-sm text-amber-800 mt-1">
                  開啟後，貼入網址建立文獻筆記時，可能會連到外部網站、Jina Reader 或後端設定的 Claude API。預設關閉。
                </p>
              </div>
              <Switch
                checked={allowExternalAnalysis}
                onCheckedChange={setAllowExternalAnalysis}
                aria-label="允許外部網址和 AI 分析"
              />
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

        {/* AllFiles Card Metadata Display */}
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="size-5 text-gray-600" />
            <h2>AllFiles 卡片顯示欄位</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">選擇要在所有檔案卡片上顯示的 metadata 欄位（從現有筆記掃描而來）</p>
          {isScanningKeys ? (
            <p className="text-sm text-gray-400">掃描筆記中...</p>
          ) : availableMetadataKeys.length === 0 ? (
            <p className="text-sm text-gray-400">目前沒有筆記包含 metadata 欄位</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {availableMetadataKeys.map(key => (
                <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={displayMetadataKeys.includes(key)}
                    onChange={e => {
                      if (e.target.checked) {
                        setDisplayMetadataKeys(prev => [...prev, key]);
                      } else {
                        setDisplayMetadataKeys(prev => prev.filter(k => k !== key));
                      }
                    }}
                    className="size-4 rounded"
                  />
                  <span className="text-sm font-mono">{key}</span>
                </label>
              ))}
            </div>
          )}
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
