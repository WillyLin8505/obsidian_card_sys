import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { Layout } from './components/Layout';

const AllFiles = lazy(() => import('./pages/AllFiles').then(module => ({ default: module.AllFiles })));
const NoteView = lazy(() => import('./pages/NoteView').then(module => ({ default: module.NoteView })));
const PermanentNotes = lazy(() => import('./pages/PermanentNotes').then(module => ({ default: module.PermanentNotes })));
const SourceNotes = lazy(() => import('./pages/SourceNotes').then(module => ({ default: module.SourceNotes })));
const Config = lazy(() => import('./pages/Config').then(module => ({ default: module.Config })));
const DatabaseMigration = lazy(() => import('./pages/DatabaseMigration').then(module => ({ default: module.DatabaseMigration })));
const DiagnosticTest = lazy(() => import('./pages/DiagnosticTest').then(module => ({ default: module.DiagnosticTest })));
const DataCheck = lazy(() => import('./pages/DataCheck').then(module => ({ default: module.DataCheck })));
const ObsidianNoteView = lazy(() => import('./pages/ObsidianNoteView').then(module => ({ default: module.ObsidianNoteView })));

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
