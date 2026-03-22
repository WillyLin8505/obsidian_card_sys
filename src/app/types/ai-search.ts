// AI Search Types

export interface NoteChunk {
  content: string;
  notePath: string;
  similarity: number;
  metadata?: {
    title?: string;
    tags?: string[];
    created?: string;
  };
}

export interface AISearchResult {
  id: string;
  question: string;
  answer: string;
  chunks: NoteChunk[];
  connectionStatus: 'connected' | 'disconnected' | 'searching';
  searchTime: number; // milliseconds
  createdAt: string;
  metadata?: {
    model?: string;
    tokensUsed?: number;
  };
}

export interface AISearchRequest {
  question: string;
}

export interface AISearchResponse {
  success: boolean;
  result?: AISearchResult;
  error?: string;
}
