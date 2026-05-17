import { projectId, publicAnonKey } from '/utils/supabase/info';
import { Note } from '../types/note';
import { AISearchRequest, AISearchResponse, AISearchResult } from '../types/ai-search';
import { KnowledgeDiscoveryRequest, KnowledgeDiscoveryResult } from '../types/knowledge-discovery';

const CONFIG_KEY = 'zettelkasten_config';

function getObsidianBackendUrl(): string {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    const config = raw ? JSON.parse(raw) : {};
    return (config.obsidianBackendUrl || 'http://localhost:3001').replace(/\/$/, '');
  } catch {
    return 'http://localhost:3001';
  }
}

function getLocalServerToken(): string {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    const config = raw ? JSON.parse(raw) : {};
    return config.localServerToken || '';
  } catch {
    return '';
  }
}

function allowsExternalAnalysis(): boolean {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    const config = raw ? JSON.parse(raw) : {};
    return config.allowExternalAnalysis === true;
  } catch {
    return false;
  }
}

function requireExternalAnalysis(): void {
  if (!allowsExternalAnalysis()) {
    throw new Error('請先到設定頁啟用「允許外部網址/AI 分析」。');
  }
}

function localHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {};
  if (extra) {
    if (extra instanceof Headers) {
      extra.forEach((value, key) => { headers[key] = value; });
    } else if (Array.isArray(extra)) {
      extra.forEach(([key, value]) => { headers[key] = value; });
    } else {
      Object.assign(headers, extra);
    }
  }
  const token = getLocalServerToken();
  if (token) headers['x-local-server-token'] = token;
  return headers;
}

async function fetchLocal(url: string, options?: RequestInit, fallback = 'Request failed'): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: localHeaders(options?.headers),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || fallback);
  }
  return response;
}

export const localApi = {
  health: async (): Promise<{ ok: boolean; qmd: { ok: boolean; message: string }; claude: { ok: boolean; message: string } }> => {
    const response = await fetch(`${getObsidianBackendUrl()}/health`, { headers: localHeaders() });
    if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
    return response.json();
  },

  getNotes: async (vaultPath: string, options?: { summary?: boolean }): Promise<Note[]> => {
    const params = new URLSearchParams({ path: vaultPath });
    if (options?.summary) params.set('summary', '1');
    const response = await fetchLocal(
      `${getObsidianBackendUrl()}/notes?${params}`,
      undefined,
      'Failed to load local notes'
    );
    return response.json();
  },

  reloadNotes: async (vaultPath: string, options?: { summary?: boolean }): Promise<Note[]> => {
    const params = new URLSearchParams({ path: vaultPath });
    if (options?.summary) params.set('summary', '1');
    const response = await fetchLocal(
      `${getObsidianBackendUrl()}/notes/reload?${params}`,
      { method: 'POST' },
      'Failed to reload notes'
    );
    return response.json();
  },

  getNoteByPath: async (relativePath: string, vaultPath: string): Promise<import('../types/note').Note> => {
    const params = new URLSearchParams({ vault: vaultPath, file: relativePath });
    const response = await fetchLocal(`${getObsidianBackendUrl()}/notes/file?${params}`, undefined, 'Failed to load note');
    return response.json();
  },

  assetUrl: (vaultPath: string, file: string, from?: string): string => {
    const params = new URLSearchParams({ vault: vaultPath, file });
    if (from) params.set('from', from);
    const token = getLocalServerToken();
    if (token) params.set('token', token);
    return `${getObsidianBackendUrl()}/notes/asset?${params}`;
  },

  updateNote: async (relativePath: string, vaultPath: string, content: string): Promise<void> => {
    await fetchLocal(`${getObsidianBackendUrl()}/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relativePath, vaultPath, content }),
    }, 'Failed to save note');
  },

  search: async (question: string): Promise<AISearchResult> => {
    const response = await fetchLocal(`${getObsidianBackendUrl()}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    }, 'Local search failed');
    return response.json();
  },

  expandQuery: async (query: string): Promise<string[]> => {
    requireExternalAnalysis();
    const response = await fetchLocal(`${getObsidianBackendUrl()}/expand-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    }, 'Query expansion failed');
    const { keywords } = await response.json();
    return keywords as string[];
  },

  suggestTags: async (query: string, availableTags: string[]): Promise<string[]> => {
    const response = await fetchLocal(`${getObsidianBackendUrl()}/suggest-tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, availableTags }),
    }, 'Tag suggestion failed');
    const { suggestedTags } = await response.json();
    return suggestedTags as string[];
  },

  generateLinkedNotes: async (
    notes: Array<{ title: string; content: string }>,
    models: string[]
  ): Promise<Array<{ model: string; title: string; content: string }>> => {
    requireExternalAnalysis();
    const response = await fetchLocal(`${getObsidianBackendUrl()}/generate-linked-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, models }),
    }, 'Note generation failed');
    const { generatedNotes } = await response.json();
    return generatedNotes as Array<{ model: string; title: string; content: string }>;
  },

  enrichNote: async (relativePath: string, vaultPath: string): Promise<void> => {
    requireExternalAnalysis();
    await fetchLocal(`${getObsidianBackendUrl()}/enrich-note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relativePath, vaultPath }),
    }, 'Enrich failed');
  },

  enrichVault: async (vaultPath: string): Promise<void> => {
    requireExternalAnalysis();
    await fetchLocal(`${getObsidianBackendUrl()}/enrich-vault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultPath }),
    }, 'Vault enrich failed');
  },

  fetchUrl: async (url: string, templateBody?: string): Promise<{ title: string; content: string }> => {
    requireExternalAnalysis();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const response = await fetchLocal(`${getObsidianBackendUrl()}/fetch-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url, templateBody }),
    }, '抓取網址失敗');
    return response.json();
  },

  createNote: async (vaultPath: string, filename: string, content: string): Promise<string> => {
    const response = await fetchLocal(`${getObsidianBackendUrl()}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultPath, filename, content }),
    }, 'Failed to create note');
    const { relativePath } = await response.json();
    return relativePath as string;
  },
};

const API_BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-fc3187a2`;

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${publicAnonKey}`,
};

export const api = {
  // Test database connection
  test: async () => {
    const response = await fetch(`${API_BASE_URL}/test`, {
      headers,
    });
    
    const result = await response.json();
    return result;
  },

  // Notes endpoints
  notes: {
    getAll: async (): Promise<Note[]> => {
      const response = await fetch(`${API_BASE_URL}/notes`, {
        headers,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch notes');
      }
      
      const { notes } = await response.json();
      return notes;
    },

    getById: async (id: string): Promise<Note> => {
      const response = await fetch(`${API_BASE_URL}/notes/${encodeURIComponent(id)}`, {
        headers,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch note');
      }
      
      const { note } = await response.json();
      return note;
    },

    create: async (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note> => {
      const response = await fetch(`${API_BASE_URL}/notes`, {
        method: 'POST',
        headers,
        body: JSON.stringify(note),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create note');
      }
      
      const { note: createdNote } = await response.json();
      return createdNote;
    },

    update: async (id: string, updates: Partial<Note>): Promise<Note> => {
      const response = await fetch(`${API_BASE_URL}/notes/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update note');
      }
      
      const { note } = await response.json();
      return note;
    },

    delete: async (id: string): Promise<void> => {
      const response = await fetch(`${API_BASE_URL}/notes/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete note');
      }
    },

    search: async (query: string, type?: string): Promise<Note[]> => {
      const params = new URLSearchParams();
      if (query) params.append('q', query);
      if (type) params.append('type', type);
      
      const response = await fetch(`${API_BASE_URL}/notes/search?${params.toString()}`, {
        headers,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to search notes');
      }
      
      const { notes } = await response.json();
      return notes;
    },
  },

  // Links endpoints
  links: {
    create: async (fromNoteId: string, toNoteId: string, linkType = 'manual', relationType?: string) => {
      const response = await fetch(`${API_BASE_URL}/links`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fromNoteId,
          toNoteId,
          linkType,
          relationType,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create link');
      }
      
      return response.json();
    },

    getForNote: async (noteId: string) => {
      const response = await fetch(`${API_BASE_URL}/links/note/${noteId}`, {
        headers,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch links');
      }
      
      return response.json();
    },

    delete: async (linkId: string) => {
      const response = await fetch(`${API_BASE_URL}/links/${linkId}`, {
        method: 'DELETE',
        headers,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete link');
      }
      
      return response.json();
    },

    updateStatus: async (linkId: string, status: 'accepted' | 'rejected') => {
      const response = await fetch(`${API_BASE_URL}/links/${linkId}/status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ status }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update link status');
      }
      
      return response.json();
    },
  },

  // AI Search endpoints
  aiSearch: {
    search: async (request: AISearchRequest): Promise<AISearchResponse> => {
      const response = await fetch(`${API_BASE_URL}/ai-search`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to perform AI search');
      }
      
      const { results } = await response.json();
      return results;
    },
  },

  // Knowledge Discovery endpoints
  knowledgeDiscovery: {
    discover: async (request: KnowledgeDiscoveryRequest): Promise<KnowledgeDiscoveryResult> => {
      const response = await fetch(`${API_BASE_URL}/knowledge-discovery`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to perform knowledge discovery');
      }
      
      const { result } = await response.json();
      return result;
    },
  },
};
