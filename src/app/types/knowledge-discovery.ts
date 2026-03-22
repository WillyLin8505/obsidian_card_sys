// Knowledge Discovery Types

export interface DiscoveryNote {
  id: string;
  title: string;
  path: string;
  summary: string;
  type: 'fleet' | 'source' | 'permanent';
  similarity: number;
  tags?: string[];
  createdAt: string;
}

export interface RelatedNote {
  note: DiscoveryNote;
  relationReason: 'semantic' | 'explicit_link' | 'shared_tags' | 'backlink';
  relationScore: number;
  relationDetails?: {
    sharedTags?: string[];
    linkType?: string;
  };
}

export interface SuggestedTag {
  tag: string;
  confidence: number;
  noteCount: number;
  reason?: string;
}

export interface KnowledgeDiscoveryResult {
  query: string;
  relevantNotes: DiscoveryNote[];
  relatedNotes: RelatedNote[];
  suggestedTags: SuggestedTag[];
  timestamp: string;
}

export interface KnowledgeDiscoveryRequest {
  query: string;
  maxRelevantNotes?: number;
  maxRelatedNotes?: number;
  maxTags?: number;
}
