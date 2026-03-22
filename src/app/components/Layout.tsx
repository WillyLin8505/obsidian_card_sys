import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { Toaster } from './ui/sonner';
import { useEffect } from 'react';
import { initializeData } from '../utils/initializeData';

export function Layout() {
  useEffect(() => {
    initializeData();
  }, []);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <Toaster position="bottom-right" />
    </div>
  );
}