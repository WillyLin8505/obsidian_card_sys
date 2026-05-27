import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { FileText, Network, BookOpen, Settings, Search, Database, Stethoscope, Eye, Mic, MicOff } from 'lucide-react';

const VoiceAssistant = lazy(() => import('./VoiceAssistant').then(m => ({ default: m.VoiceAssistant })));

const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

const WAKE_PHRASES = ['hey jarvis', 'hey Jarvis'];

function voiceAssistantPage(pathname: string) {
  if (pathname.startsWith('/permanent-notes')) return { key: 'permanent-notes', label: '連結筆記' };
  if (pathname.startsWith('/source-notes')) return { key: 'source-notes', label: '文獻筆記' };
  return { key: 'all-files', label: '所有檔案' };
}

export function Sidebar() {
  const location = useLocation();
  const voicePage = voiceAssistantPage(location.pathname);
  const [showVoice, setShowVoice] = useState(false);
  const [wakeMode, setWakeMode] = useState(false);

  const wakeRecRef = useRef<any>(null);

  // Wake word listener — runs only when wakeMode=true and assistant is closed
  useEffect(() => {
    if (!wakeMode || showVoice || !SpeechRecognitionAPI) {
      wakeRecRef.current?.abort();
      wakeRecRef.current = null;
      return;
    }

    let cancelled = false;

    const listen = () => {
      if (cancelled) return;
      const rec = new SpeechRecognitionAPI();
      rec.lang = 'en-US';
      rec.continuous = false;
      rec.interimResults = false;
      wakeRecRef.current = rec;

      rec.onresult = (e: any) => {
        const text: string = e.results[0]?.[0]?.transcript ?? '';
        if (WAKE_PHRASES.some(p => text.includes(p))) {
          setShowVoice(true);
        }
      };

      rec.onend = () => { if (!cancelled) setTimeout(listen, 300); };
      rec.onerror = () => { if (!cancelled) setTimeout(listen, 800); };

      try { rec.start(); } catch { setTimeout(listen, 1000); }
    };

    listen();

    return () => {
      cancelled = true;
      wakeRecRef.current?.abort();
      wakeRecRef.current = null;
    };
  }, [wakeMode, showVoice]);

  const links = [
    { to: '/all-files', icon: Search, label: '所有檔案' },
    { to: '/permanent-notes', icon: Network, label: '連結筆記' },
    { to: '/source-notes', icon: BookOpen, label: '文獻筆記' },
    { to: '/config', icon: Settings, label: '設定' },
    { to: '/data-check', icon: Eye, label: '資料檢查' },
    { to: '/database-migration', icon: Database, label: '資料庫管理' },
    { to: '/diagnostic-test', icon: Stethoscope, label: '系統診斷' },
  ];

  return (
    <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-screen">
      <div className="p-6 border-b border-gray-200">
        <h1 className="flex items-center gap-2">
          <FileText className="size-6" />
          卡片盒筆記
        </h1>
      </div>

      <nav className="flex-1 p-4 flex flex-col overflow-hidden">
        <ul className="space-y-2 shrink-0">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = location.pathname === link.to ||
                           (link.to !== '/all-files' && location.pathname.startsWith(link.to));

            return (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="size-5" />
                  <span>{link.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex flex-col overflow-hidden">
          {/* Voice assistant toggle + wake mode button */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowVoice(v => !v)}
              className={`flex-1 flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                showVoice
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-700'
              }`}
            >
              <Mic className="size-5" />
              <span>語音助理</span>
            </button>

            {/* Wake word toggle */}
            <button
              onClick={() => setWakeMode(v => !v)}
              title={wakeMode ? '關閉喚醒詞（你好筆記）' : '開啟喚醒詞（你好筆記）'}
              className={`p-2 rounded-lg transition-colors ${
                wakeMode
                  ? 'bg-red-100 text-red-600'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
              }`}
            >
              {wakeMode
                ? <span className="relative flex size-2 mx-1"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full size-2 bg-red-500" /></span>
                : <MicOff className="size-4" />
              }
            </button>
          </div>

          {wakeMode && !showVoice && (
            <p className="text-xs text-gray-400 px-4 mt-1">說「Hey Jarvis」可喚醒</p>
          )}

          {showVoice && (
            <Suspense fallback={null}>
              <VoiceAssistant pageKey={voicePage.key} pageLabel={voicePage.label} />
            </Suspense>
          )}
        </div>
      </nav>
    </div>
  );
}
