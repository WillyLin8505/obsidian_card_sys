export interface Note {
  id: string;
  title: string;
  content: string;
  searchText?: string;
  frontmatter?: Record<string, string>;
  type: 'fleet' | 'source' | 'permanent';
  tags: string[];
  links: string[]; // IDs of linked notes
  sourceUrl?: string; // For source notes
  createdAt: string;
  updatedAt: string;
}

export type DataSource = 'supabase' | 'obsidian' | 'local';

export interface MetadataField {
  key: string;
  defaultValue: string;
}

export interface NoteTemplateConfig {
  metadataFields: MetadataField[];
  bodyTemplate: string;
}

export interface CardFontSizes {
  title: number;    // note card title
  h1: number;       // # in markdown content
  h2: number;       // ## in markdown content
  h3: number;       // ### in markdown content
  h4: number;       // #### in markdown content
  body: number;     // body text
  metadata: number; // tags and frontmatter values
}

export interface Config {
  notePath: string;
  sourceNoteSavePath?: string;
  fleetNoteTemplate: NoteTemplateConfig;
  permanentNoteTemplate: NoteTemplateConfig;
  sourceNoteTemplate: NoteTemplateConfig;
  obsidianBackendUrl?: string;
  localServerToken?: string;
  allowExternalAnalysis: boolean;
  dataSource: DataSource;
  fleetNoteTags: string[];
  sourceNoteTags: string[];
  displayMetadataKeys: string[];
  fontSize: number;
  cardFontSizes: CardFontSizes;
}
