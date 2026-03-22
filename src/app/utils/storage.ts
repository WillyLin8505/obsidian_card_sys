import { Note, Config, DataSource } from '../types/note';
import { api, localApi } from './api';

const NOTES_KEY = 'zettelkasten_notes';
const CONFIG_KEY = 'zettelkasten_config';

const DEFAULT_CONFIG: Config = {
  notePath: '~/Documents/Notes',
  dataSource: 'supabase',
  obsidianBackendUrl: 'http://localhost:3001',
  fleetNoteTemplate: '---\ncreate date: \naliases:\ntags:\n  - 3card/筆記法/卡片盒筆記法/靈感筆記\n---\n\n# Note\n\n# Question \n\n# personal connection or purpose\n\n# TO DO step \n\n# others &  Reference',
  permanentNoteTemplate: '---\ncreate date: \naliases:\ntags:\n  - 3card/筆記法/卡片盒筆記法/永久筆記\n---\n\n# Note\n\n# Question \n\n# personal connection or purpose\n\n# TO DO step \n\n# others &  Reference',
  sourceNoteTemplate: '---\ncreate date: \naliases:\ntags:\n  - 3card/筆記法/卡片盒筆記法/文獻筆記\n---\n\n# 文獻筆記\n\n## 來源資訊\n- 作者：\n- 標題：\n- 連結：\n\n## 重點摘要\n\n## 個人想法\n\n',
};

function getDataSource(): DataSource {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    const config: Partial<Config> = raw ? JSON.parse(raw) : {};
    return config.dataSource || 'supabase';
  } catch {
    return 'supabase';
  }
}

export const storage = {
  // Notes operations
  getNotes: async (): Promise<Note[]> => {
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
        return await localApi.getNotes(vaultPath);
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

  addNote: async (note: Note): Promise<Note> => {
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

    const notes = await storage.getNotes();
    notes.push(note);
    storage.saveNotes(notes);
    return note;
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
      try {
        await api.notes.delete(id);
        return;
      } catch (error) {
        console.error('Error deleting note via Supabase:', error);
      }
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

    const notes = await storage.getNotes();
    return notes.find(n => n.id === id);
  },

  // Config operations
  getConfig: (): Config => {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const saved = JSON.parse(raw) as Partial<Config>;
    return { ...DEFAULT_CONFIG, ...saved };
  },

  saveConfig: (config: Config): void => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
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
