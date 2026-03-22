import { Link, useLocation } from 'react-router';
import { FileText, Network, BookOpen, Settings, Search, Database, Stethoscope, Eye } from 'lucide-react';

export function Sidebar() {
  const location = useLocation();

  const links = [
    { to: '/all-files', icon: Search, label: '所有檔案' },
    { to: '/permanent-notes', icon: Network, label: '永久筆記' },
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
      
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
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
      </nav>
    </div>
  );
}