import { projectId, publicAnonKey } from '/utils/supabase/info';
import { Note } from '../types/note';
import { AISearchRequest, AISearchResponse, AISearchResult } from '../types/ai-search';
import { KnowledgeDiscoveryRequest, KnowledgeDiscoveryResult } from '../types/knowledge-discovery';

function getObsidianBackendUrl(): string {
  const CONFIG_KEY = 'zettelkasten_config';
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    const config = raw ? JSON.parse(raw) : {};
    return (config.obsidianBackendUrl || 'http://localhost:3001').replace(/\/$/, '');
  } catch {
    return 'http://localhost:3001';
  }
}

export const localApi = {
  health: async (): Promise<{ ok: boolean; qmd: { ok: boolean; message: string }; claude: { ok: boolean; message: string } }> => {
    const baseUrl = getObsidianBackendUrl();
    const response = await fetch(`${baseUrl}/health`);
    if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
    return response.json();
  },

  getNotes: async (vaultPath: string): Promise<Note[]> => {
    const baseUrl = getObsidianBackendUrl();
    const response = await fetch(`${baseUrl}/notes?path=${encodeURIComponent(vaultPath)}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(err.error || 'Failed to load local notes');
    }
    return response.json();
  },

  getNoteByPath: async (relativePath: string, vaultPath: string): Promise<import('../types/note').Note> => {
    const baseUrl = getObsidianBackendUrl();
    const params = new URLSearchParams({ vault: vaultPath, file: relativePath });
    const response = await fetch(`${baseUrl}/notes/file?${params}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(err.error || 'Failed to load note');
    }
    return response.json();
  },

  updateNote: async (relativePath: string, vaultPath: string, content: string): Promise<void> => {
    const baseUrl = getObsidianBackendUrl();
    const response = await fetch(`${baseUrl}/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relativePath, vaultPath, content }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(err.error || 'Failed to save note');
    }
  },

  search: async (question: string): Promise<AISearchResult> => {
    const baseUrl = getObsidianBackendUrl();
    const response = await fetch(`${baseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(err.error || 'Local search failed');
    }
    return response.json();
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
      const response = await fetch(`${API_BASE_URL}/notes/${id}`, {
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
      const response = await fetch(`${API_BASE_URL}/notes/${id}`, {
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
      const response = await fetch(`${API_BASE_URL}/notes/${id}`, {
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