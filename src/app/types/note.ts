export interface Note {
  id: string;
  title: string;
  content: string;
  type: 'fleet' | 'source' | 'permanent';
  tags: string[];
  links: string[]; // IDs of linked notes
  sourceUrl?: string; // For source notes
  createdAt: string;
  updatedAt: string;
}

export type DataSource = 'supabase' | 'obsidian' | 'local';

export interface Config {
  notePath: string;
  fleetNoteTemplate: string;
  permanentNoteTemplate: string;
  sourceNoteTemplate: string;
  obsidianBackendUrl?: string;
  dataSource: DataSource;
  fleetNoteTags: string[];
  sourceNoteTags: string[];
}