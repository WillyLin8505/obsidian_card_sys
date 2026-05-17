import { Note, Config, NoteTemplateConfig, MetadataField, DataSource, CardFontSizes } from '../types/note';
import { api, localApi } from './api';

const NOTES_KEY = 'zettelkasten_notes';
const CONFIG_KEY = 'zettelkasten_config';
const RECENTLY_OPENED_KEY = 'zettelkasten_recently_opened';

const DEFAULT_CARD_FONT_SIZES: CardFontSizes = {
  title: 18,
  h1: 16,
  h2: 14,
  h3: 13,
  h4: 12,
  body: 12,
  metadata: 11,
};

const DEFAULT_CONFIG: Config = {
  notePath: '~/Documents/Notes',
  sourceNoteSavePath: '',
  dataSource: 'supabase',
  obsidianBackendUrl: 'http://localhost:3001',
  allowExternalAnalysis: false,
  fleetNoteTemplate: {
    metadataFields: [
      { key: 'create date', defaultValue: '' },
      { key: 'aliases', defaultValue: '' },
      { key: 'tags', defaultValue: '3card/筆記法/卡片盒筆記法/靈感筆記' },
    ],
    bodyTemplate: '# Note\n\n# Question \n\n# personal connection or purpose\n\n# TO DO step \n\n# others &  Reference',
  },
  permanentNoteTemplate: {
    metadataFields: [
      { key: 'create date', defaultValue: '' },
      { key: 'aliases', defaultValue: '' },
      { key: 'tags', defaultValue: '3card/筆記法/卡片盒筆記法/永久筆記' },
    ],
    bodyTemplate: '# Note\n\n# Question \n\n# personal connection or purpose\n\n# TO DO step \n\n# others &  Reference',
  },
  sourceNoteTemplate: {
    metadataFields: [
      { key: 'create date', defaultValue: '' },
      { key: 'aliases', defaultValue: '' },
      { key: 'tags', defaultValue: '3card/筆記法/卡片盒筆記法/文獻筆記' },
    ],
    bodyTemplate: '# 文獻筆記\n\n## 來源資訊\n- 作者：\n- 標題：\n- 連結：\n\n## 重點摘要\n\n',
  },
  fleetNoteTags: [],
  sourceNoteTags: [],
  displayMetadataKeys: [],
  fontSize: 12,
  cardFontSizes: DEFAULT_CARD_FONT_SIZES,
};

function migrateTemplate(value: unknown): NoteTemplateConfig {
  if (typeof value === 'object' && value !== null && 'metadataFields' in value) {
    return value as NoteTemplateConfig;
  }
  if (typeof value !== 'string') {
    return { metadataFields: [], bodyTemplate: '' };
  }
  // Parse frontmatter from legacy string
  const fmMatch = value.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { metadataFields: [], bodyTemplate: value };
  }
  const fmLines = fmMatch[1].split('\n');
  const body = fmMatch[2].replace(/^\n/, '');
  const fields: MetadataField[] = [];
  let i = 0;
  while (i < fmLines.length) {
    const line = fmLines[i];
    const kv = line.match(/^([^:]+):\s*(.*)$/);
    if (!kv) { i++; continue; }
    const key = kv[1].trim();
    let val = kv[2].trim();
    // Collect indented list items (e.g. tags)
    const listItems: string[] = [];
    while (i + 1 < fmLines.length && fmLines[i + 1].startsWith('  - ')) {
      listItems.push(fmLines[i + 1].replace(/^\s+-\s*/, '').trim());
      i++;
    }
    if (listItems.length > 0) val = listItems.join(',');
    fields.push({ key, defaultValue: val });
    i++;
  }
  return { metadataFields: fields, bodyTemplate: body };
}

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

    if (source === 'obsidian') {
      try {
        const config = storage.getConfig();
        const vaultPath = config.notePath || '';
        if (!vaultPath) throw new Error('請先在設定頁面填寫 Obsidian Vault 路徑');
        const safeTitle = (note.title || 'new-note').replace(/[/\\?%*:|"<>]/g, '-');
        const filename = `${safeTitle}-${Date.now()}.md`;
        const relativePath = await localApi.createNote(vaultPath, filename, note.content);
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
    const saved = JSON.parse(raw) as Record<string, unknown>;
    if ('claudeApiKey' in saved) {
      delete saved.claudeApiKey;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(saved));
    }
    return {
      ...DEFAULT_CONFIG,
      ...(saved as Partial<Config>),
      cardFontSizes: { ...DEFAULT_CARD_FONT_SIZES, ...((saved.cardFontSizes as Partial<CardFontSizes>) || {}) },
      fleetNoteTemplate: migrateTemplate(saved.fleetNoteTemplate ?? DEFAULT_CONFIG.fleetNoteTemplate),
      permanentNoteTemplate: migrateTemplate(saved.permanentNoteTemplate ?? DEFAULT_CONFIG.permanentNoteTemplate),
      sourceNoteTemplate: migrateTemplate(saved.sourceNoteTemplate ?? DEFAULT_CONFIG.sourceNoteTemplate),
    };
  },

  saveConfig: (config: Config): void => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  },

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
