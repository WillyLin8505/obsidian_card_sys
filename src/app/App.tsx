import { Suspense } from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { DatabaseStatus } from './components/DatabaseStatus';
import { Toaster } from 'sonner';

export default function App() {
  return (
    <>
      <Suspense fallback={<div className="p-6 text-sm text-gray-500">載入中...</div>}>
        <RouterProvider router={router} />
      </Suspense>
      <DatabaseStatus />
      <Toaster position="bottom-right" />
    </>
  );
}
