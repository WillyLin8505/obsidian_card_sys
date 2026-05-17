/**
 * Integration tests for ctrl+click navigation using real React Router routing.
 * These tests do NOT mock useNavigate - they use the actual navigate() function
 * from React Router so that ctrl+click actually changes the URL and location state.
 *
 * This test file catches bugs that only appear during real navigation, such as:
 * - location.state being lost between renders
 * - isEditing not being set correctly after navigation
 * - useEffect dependencies not triggering correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { SourceNotes } from '../../app/pages/SourceNotes';
import { Note } from '../../app/types/note';

// ---------------------------------------------------------------------------
// Mock everything EXCEPT react-router (no useNavigate mock here)
// ---------------------------------------------------------------------------

vi.mock('../../app/utils/storage', () => ({
  storage: {
    getNotes: vi.fn(),
    getNoteById: vi.fn(),
    getConfig: vi.fn().mockReturnValue({
      dataSource: 'local',
      notePath: '',
      fleetNoteTemplate: '',
      permanentNoteTemplate: '',
      sourceNoteTemplate: '',
      fleetNoteTags: [],
      sourceNoteTags: [],
    }),
    addNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
  },
}));

vi.mock('../../app/hooks/useDragSelect', () => ({
  useDragSelect: () => ({
    isSelecting: false,
    selectionBox: null,
    isInSelectionBox: () => false,
    getSelectionBoxStyle: () => null,
    shouldClearSelection: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeSourceNote = (): Note => ({
  id: 'source-note-1',
  title: 'Test Source Note',
  content: '# Test\n\nSome content here',
  type: 'source',
  tags: ['test'],
  links: [],
  sourceUrl: 'https://example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SourceNotes - real navigation with ctrl+click enters edit mode', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { storage } = await import('../../app/utils/storage');
    const note = makeSourceNote();
    vi.mocked(storage.getNotes).mockResolvedValue([note]);
    vi.mocked(storage.getNoteById).mockImplementation(async (id: string) =>
      id === note.id ? note : null
    );
    vi.mocked(storage.getConfig).mockReturnValue({
      dataSource: 'local',
      notePath: '',
      fleetNoteTemplate: '',
      permanentNoteTemplate: '',
      sourceNoteTemplate: '',
      fleetNoteTags: [],
      sourceNoteTags: [],
    });
  });

  it('ctrl+click from list view navigates to detail and shows edit mode (Save button visible)', async () => {
    // Create a real memory router starting at the list page
    const router = createMemoryRouter(
      [
        { path: '/source-notes', Component: SourceNotes },
        { path: '/source-notes/:id', Component: SourceNotes },
      ],
      { initialEntries: ['/source-notes'] }
    );

    render(<RouterProvider router={router} />);

    // Step 1: Wait for the list to load
    await waitFor(() => {
      expect(screen.getByText('Test Source Note')).toBeInTheDocument();
    });

    // Verify we start in list mode (no Save button, no title input)
    expect(screen.queryByRole('button', { name: /儲存/i })).toBeNull();
    expect(screen.queryByPlaceholderText(/輸入標題/i)).toBeNull();

    // Step 2: Ctrl+click on the note card
    const card = screen.getByText('Test Source Note').closest('[class*="cursor-pointer"]') as HTMLElement;
    expect(card).toBeTruthy();
    fireEvent.click(card, { ctrlKey: true });

    // Step 3: After navigation, should be in edit mode
    // The Save button or title input should appear
    await waitFor(() => {
      const saveBtn = screen.queryByRole('button', { name: /儲存/i });
      const titleInput = screen.queryByPlaceholderText(/輸入標題/i);
      expect(
        saveBtn !== null || titleInput !== null,
        'Expected edit mode after ctrl+click: Save button or title input should be visible'
      ).toBe(true);
    });

    // The plain "編輯" button should NOT be visible when in edit mode
    expect(screen.queryByRole('button', { name: /^編輯$/i })).toBeNull();
  });

  it('normal click from list view navigates to detail and shows preview mode (編輯 button visible)', async () => {
    const router = createMemoryRouter(
      [
        { path: '/source-notes', Component: SourceNotes },
        { path: '/source-notes/:id', Component: SourceNotes },
      ],
      { initialEntries: ['/source-notes'] }
    );

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText('Test Source Note')).toBeInTheDocument();
    });

    // Normal click (no ctrlKey)
    const card = screen.getByText('Test Source Note').closest('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(card);

    // After normal navigation, should be in PREVIEW mode
    await waitFor(() => {
      const editBtn = screen.queryByRole('button', { name: /^編輯$/i });
      expect(editBtn).not.toBeNull();
    });

    // Save button should NOT be visible
    expect(screen.queryByRole('button', { name: /儲存/i })).toBeNull();
  });

  it('clicking 編輯 button in preview mode switches to edit mode', async () => {
    const router = createMemoryRouter(
      [
        { path: '/source-notes/:id', Component: SourceNotes },
      ],
      { initialEntries: [{ pathname: '/source-notes/source-note-1', state: null }] }
    );

    render(<RouterProvider router={router} />);

    // Wait for preview mode
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^編輯$/i })).not.toBeNull();
    });

    // Click 編輯 button
    fireEvent.click(screen.getByRole('button', { name: /^編輯$/i }));

    // Should now show Save button (edit mode)
    await waitFor(() => {
      const saveBtn = screen.queryByRole('button', { name: /儲存/i });
      const titleInput = screen.queryByPlaceholderText(/輸入標題/i);
      expect(saveBtn !== null || titleInput !== null).toBe(true);
    });
  });
});
