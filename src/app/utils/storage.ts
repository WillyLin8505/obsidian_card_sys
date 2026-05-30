import { Note, Config } from '../types/note';
import { api, localApi } from './api';
import { getConfig, getDataSource, saveConfig } from './appConfig';

const NOTES_KEY = 'zettelkasten_notes';
const RECENTLY_OPENED_KEY = 'zettelkasten_recently_opened';
const NOTES_CACHE_TTL_MS = 60_000;

type NotesOptions = { summary?: boolean; force?: boolean };
type NotesCacheEntry = { notes: Note[]; timestamp: number };

const notesMemoryCache = new Map<string, NotesCacheEntry>();
const notesInflight = new Map<string, Promise<Note[]>>();

function obsidianCacheKey(vaultPath: string, options?: NotesOptions): string {
  return `${vaultPath}\0${options?.summary ? 'summary' : 'full'}`;
}

function clearObsidianCache(vaultPath?: string): void {
  if (!vaultPath) {
    notesMemoryCache.clear();
    notesInflight.clear();
    return;
  }
  for (const key of notesMemoryCache.keys()) {
    if (key.startsWith(`${vaultPath}\0`)) notesMemoryCache.delete(key);
  }
  for (const key of notesInflight.keys()) {
    if (key.startsWith(`${vaultPath}\0`)) notesInflight.delete(key);
  }
}

function dedupeVisibleNotes(raw: Note[]): Note[] {
  const seen = new Set<string>();
  return raw.filter(note => {
    const id = note.id.replace(/\\/g, '/');
    const lower = id.toLowerCase();
    if (lower.startsWith('.trash/') || lower.includes('/.trash/')) return false;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export const storage = {
  // Notes operations
  getNotes: async (options?: NotesOptions): Promise<Note[]> => {
    const source = getDataSource();

    if (source === 'supabase') {
      try {
        return await api.notes.getAll();
      } catch (error) {
        console.error('Error fetching notes from Supabase:', error);
        const notes = localStorage.getItem(NOTES_KEY);
        return notes ? JSON.parse(notes) : [];
      }
    }

    if (source === 'obsidian') {
      try {
        const config = storage.getConfig();
        const vaultPath = config.notePath || '';
        if (!vaultPath) throw new Error('請先在設定頁面填寫 Obsidian Vault 路徑');
        const key = obsidianCacheKey(vaultPath, options);
        const cached = notesMemoryCache.get(key);
        if (!options?.force && cached && Date.now() - cached.timestamp < NOTES_CACHE_TTL_MS) {
          return cached.notes;
        }

        const existing = !options?.force ? notesInflight.get(key) : undefined;
        if (existing) return existing;

        const request = localApi.getNotes(vaultPath, options).then(raw => {
          const notes = dedupeVisibleNotes(raw);
          notesMemoryCache.set(key, { notes, timestamp: Date.now() });
          return notes;
        }).finally(() => {
          notesInflight.delete(key);
        });
        notesInflight.set(key, request);
        return request;
      } catch (error) {
        console.error('Error fetching notes from Obsidian vault:', error);
        throw error;
      }
    }

    // 'local'
    const notes = localStorage.getItem(NOTES_KEY);
    return notes ? JSON.parse(notes) : [];
  },

  saveNotes: (notes: Note[]): void => {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  },

  invalidateNotesCache: (): void => {
    clearObsidianCache();
  },

  reloadNotes: async (options?: { summary?: boolean }): Promise<Note[]> => {
    const source = getDataSource();
    if (source !== 'obsidian') return storage.getNotes({ ...options, force: true });

    const config = storage.getConfig();
    const vaultPath = config.notePath || '';
    if (!vaultPath) throw new Error('請先在設定頁面填寫 Obsidian Vault 路徑');
    clearObsidianCache(vaultPath);
    const notes = dedupeVisibleNotes(await localApi.reloadNotes(vaultPath, options));
    notesMemoryCache.set(obsidianCacheKey(vaultPath, options), { notes, timestamp: Date.now() });
    return notes;
  },

  addNote: async (note: Note, options?: { targetDirectory?: string }): Promise<Note> => {
    const source = getDataSource();

    if (source === 'supabase') {
      try {
        const { id, createdAt, updatedAt, ...noteData } = note;
        return await api.notes.create(noteData);
      } catch (error) {
        console.error('Error creating note via Supabase:', error);
        throw error;
      }
    }

    if (source === 'obsidian') {
      try {
        const config = storage.getConfig();
        const vaultPath = config.notePath || '';
        if (!vaultPath) throw new Error('請先在設定頁面填寫 Obsidian Vault 路徑');
        const safeTitle = (note.title || 'new-note').replace(/[/\\?%*:|"<>]/g, '-');
        const filename = `${safeTitle}.md`;
        const relativePath = await localApi.createNote(vaultPath, filename, note.content, options?.targetDirectory);
        clearObsidianCache(vaultPath);
        return { ...note, id: relativePath };
      } catch (error) {
        console.error('Error creating note in Obsidian vault:', error);
        throw error;
      }
    }

    // local mode
    const rawNotes = localStorage.getItem(NOTES_KEY);
    const allNotes: Note[] = rawNotes ? JSON.parse(rawNotes) : [];
    const noteWithId: Note = { ...note, id: note.id || crypto.randomUUID() };
    allNotes.push(noteWithId);
    localStorage.setItem(NOTES_KEY, JSON.stringify(allNotes));
    return noteWithId;
  },

  updateNote: async (id: string, updates: Partial<Note>): Promise<void> => {
    const source = getDataSource();

    if (source === 'supabase') {
      try {
        await api.notes.update(id, updates);
        return;
      } catch (error) {
        console.error('Error updating note via Supabase:', error);
      }
    }

    if (source === 'obsidian') {
      const config = storage.getConfig();
      const vaultPath = config.notePath || '';
      if (!vaultPath) throw new Error('請先在設定頁面填寫 Obsidian Vault 路徑');
      if (typeof updates.content !== 'string') {
        throw new Error('Obsidian 筆記更新需要提供 content');
      }
      await localApi.updateNote(id, vaultPath, updates.content);
      clearObsidianCache(vaultPath);
      return;
    }

    const notes = await storage.getNotes();
    const index = notes.findIndex(n => n.id === id);
    if (index !== -1) {
      notes[index] = { ...notes[index], ...updates, updatedAt: new Date().toISOString() };
      storage.saveNotes(notes);
    }
  },

  deleteNote: async (id: string): Promise<void> => {
    const source = getDataSource();

    if (source === 'supabase') {
      await api.notes.delete(id);
      return;
    }

    if (source === 'obsidian') {
      const config = storage.getConfig();
      const vaultPath = config.notePath || '';
      if (!vaultPath) throw new Error('請先在設定頁面填寫 Obsidian Vault 路徑');
      await localApi.deleteNote(id, vaultPath);
      clearObsidianCache(vaultPath);
      return;
    }

    const notes = await storage.getNotes();
    storage.saveNotes(notes.filter(n => n.id !== id));
  },

  getNoteById: async (id: string): Promise<Note | undefined> => {
    const source = getDataSource();

    if (source === 'supabase') {
      try {
        return await api.notes.getById(id);
      } catch (error: any) {
        console.error(`Error fetching note by ID from Supabase (ID: ${id}):`, error.message);
        return undefined;
      }
    }

    if (source === 'obsidian') {
      try {
        const config = storage.getConfig();
        const vaultPath = config.notePath || '';
        if (!vaultPath) throw new Error('請先在設定頁面填寫 Obsidian Vault 路徑');
        return await localApi.getNoteByPath(id, vaultPath);
      } catch (error: any) {
        console.error(`Error fetching note by path from Obsidian (ID: ${id}):`, error.message);
        return undefined;
      }
    }

    const notes = await storage.getNotes();
    return notes.find(n => n.id === id);
  },

  // Config operations
  getConfig,

  saveConfig: (config: Config): void => saveConfig(config),

  // Recently opened tracking
  recordOpened: (noteId: string): void => {
    try {
      const raw = localStorage.getItem(RECENTLY_OPENED_KEY);
      const data: Record<string, number> = raw ? JSON.parse(raw) : {};
      data[noteId] = Date.now();
      const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 500);
      localStorage.setItem(RECENTLY_OPENED_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch {}
  },

  getRecentlyOpenedMap: (): Record<string, number> => {
    try {
      const raw = localStorage.getItem(RECENTLY_OPENED_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  },

  // Link operations
  addLink: async (noteId: string, linkedNoteId: string): Promise<void> => {
    const source = getDataSource();

    if (source === 'supabase') {
      try {
        await api.links.create(noteId, linkedNoteId);
        return;
      } catch (error) {
        console.error('Error creating link via Supabase:', error);
      }
    }

    const notes = await storage.getNotes();
    const noteIndex = notes.findIndex(n => n.id === noteId);
    if (noteIndex !== -1 && !notes[noteIndex].links.includes(linkedNoteId)) {
      notes[noteIndex].links.push(linkedNoteId);
      notes[noteIndex].updatedAt = new Date().toISOString();
      storage.saveNotes(notes);
    }
  },

  removeLink: async (noteId: string, linkedNoteId: string): Promise<void> => {
    const source = getDataSource();

    if (source === 'supabase') {
      try {
        const { links } = await api.links.getForNote(noteId);
        const link = links.find((l: any) =>
          (l.from_note_id === noteId && l.to_note_id === linkedNoteId) ||
          (l.to_note_id === noteId && l.from_note_id === linkedNoteId)
        );
        if (link) await api.links.delete(link.id);
        return;
      } catch (error) {
        console.error('Error removing link via Supabase:', error);
      }
    }

    const notes = await storage.getNotes();
    const noteIndex = notes.findIndex(n => n.id === noteId);
    if (noteIndex !== -1) {
      notes[noteIndex].links = notes[noteIndex].links.filter(id => id !== linkedNoteId);
      notes[noteIndex].updatedAt = new Date().toISOString();
      storage.saveNotes(notes);
    }
  },
};

export function sortByRecentActivity(notes: Note[]): Note[] {
  const openedMap = storage.getRecentlyOpenedMap();
  return [...notes].sort((a, b) => {
    const aBase = new Date(a.updatedAt).getTime() || new Date(a.createdAt).getTime() || 0;
    const bBase = new Date(b.updatedAt).getTime() || new Date(b.createdAt).getTime() || 0;
    const aTime = Math.max(aBase, openedMap[a.id] || 0);
    const bTime = Math.max(bBase, openedMap[b.id] || 0);
    return bTime - aTime;
  });
}
