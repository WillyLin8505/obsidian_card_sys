import { RouterProvider } from 'react-router';
import { router } from './routes';
import { DatabaseStatus } from './components/DatabaseStatus';
import { Toaster } from 'sonner';

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <DatabaseStatus />
      <Toaster position="bottom-right" />
    </>
  );
}