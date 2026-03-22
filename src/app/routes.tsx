import { createBrowserRouter, Navigate } from 'react-router';
import { Layout } from './components/Layout';
import { AllFiles } from './pages/AllFiles';
import { NoteView } from './pages/NoteView';
import { PermanentNotes } from './pages/PermanentNotes';
import { SourceNotes } from './pages/SourceNotes';
import { Config } from './pages/Config';
import { DatabaseMigration } from './pages/DatabaseMigration';
import { DiagnosticTest } from './pages/DiagnosticTest';
import { DataCheck } from './pages/DataCheck';
import { ObsidianNoteView } from './pages/ObsidianNoteView';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, element: <Navigate to="/all-files" replace /> },
      { path: 'all-files', Component: AllFiles },
      { path: 'fleet-notes/:id', Component: NoteView },
      { path: 'permanent-notes', Component: PermanentNotes },
      { path: 'permanent-notes/:id', Component: NoteView },
      { path: 'source-notes', Component: SourceNotes },
      { path: 'source-notes/:id', Component: SourceNotes },
      { path: 'obsidian-note/:id', Component: ObsidianNoteView },
      { path: 'config', Component: Config },
      { path: 'database-migration', Component: DatabaseMigration },
      { path: 'diagnostic-test', Component: DiagnosticTest },
      { path: 'data-check', Component: DataCheck },
      { path: '*', element: <Navigate to="/all-files" replace /> },
    ],
  },
]);