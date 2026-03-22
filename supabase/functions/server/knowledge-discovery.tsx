import { Hono } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";

const app = new Hono();

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// POST /knowledge-discovery - Discover knowledge based on query
app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { 
      query, 
      maxRelevantNotes = 10, 
      maxRelatedNotes = 8, 
      maxTags = 10 
    } = body;

    if (!query) {
      return c.json({ 
        success: false, 
        error: 'Query is required' 
      }, 400);
    }

    console.log('🔍 Knowledge discovery query:', { query, maxRelevantNotes, maxRelatedNotes, maxTags });

    // Fetch all notes from database
    const { data: allNotes, error: notesError } = await supabase
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false });

    if (notesError) {
      console.error('❌ Error fetching notes:', notesError);
      return c.json({ 
        success: false, 
        error: `Failed to fetch notes: ${notesError.message}` 
      }, 500);
    }

    // Simple text-based relevance scoring (can be enhanced with semantic search)
    const scoredNotes = allNotes.map(note => {
      const titleMatch = note.title.toLowerCase().includes(query.toLowerCase());
      const contentMatch = note.content.toLowerCase().includes(query.toLowerCase());
      const tagsMatch = note.tags?.some((tag: string) => 
        tag.toLowerCase().includes(query.toLowerCase())
      );

      let score = 0;
      if (titleMatch) score += 0.5;
      if (contentMatch) score += 0.3;
      if (tagsMatch) score += 0.2;

      // Additional scoring based on how many times query appears
      const queryLower = query.toLowerCase();
      const titleOccurrences = (note.title.toLowerCase().match(new RegExp(queryLower, 'g')) || []).length;
      const contentOccurrences = (note.content.toLowerCase().match(new RegExp(queryLower, 'g')) || []).length;
      
      score += Math.min(titleOccurrences * 0.1, 0.3);
      score += Math.min(contentOccurrences * 0.05, 0.2);

      return {
        ...note,
        similarity: Math.min(score, 1.0),
      };
    });

    // Get relevant notes (top scored notes)
    const relevantNotes = scoredNotes
      .filter(note => note.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxRelevantNotes)
      .map(note => ({
        id: note.id,
        title: note.title,
        path: `/${note.type}/${note.title.replace(/\s+/g, '-').toLowerCase()}.md`,
        summary: note.content.substring(0, 150) + (note.content.length > 150 ? '...' : ''),
        type: note.type,
        similarity: note.similarity,
        tags: note.tags || [],
        createdAt: note.created_at,
      }));

    // Get IDs of relevant notes
    const relevantNoteIds = relevantNotes.map(n => n.id);

    // Find related notes through links
    const { data: links, error: linksError } = await supabase
      .from('note_links')
      .select('*')
      .or(`from_note_id.in.(${relevantNoteIds.join(',')}),to_note_id.in.(${relevantNoteIds.join(',')})`);

    if (linksError) {
      console.warn('⚠️ Error fetching links:', linksError);
    }

    // Build related notes
    const relatedNotesMap = new Map();

    // Add notes connected via explicit links
    links?.forEach((link: any) => {
      const targetId = relevantNoteIds.includes(link.from_note_id) 
        ? link.to_note_id 
        : link.from_note_id;
      
      if (!relevantNoteIds.includes(targetId)) {
        const targetNote = allNotes.find(n => n.id === targetId);
        if (targetNote) {
          relatedNotesMap.set(targetId, {
            note: {
              id: targetNote.id,
              title: targetNote.title,
              path: `/${targetNote.type}/${targetNote.title.replace(/\s+/g, '-').toLowerCase()}.md`,
              summary: targetNote.content.substring(0, 100) + '...',
              type: targetNote.type,
              similarity: 0,
              tags: targetNote.tags || [],
              createdAt: targetNote.created_at,
            },
            relationReason: 'explicit_link',
            relationScore: 0.85,
            relationDetails: {
              linkType: link.link_type || 'manual',
            },
          });
        }
      }
    });

    // Add notes with shared tags
    const relevantTags = new Set();
    relevantNotes.forEach(note => {
      note.tags?.forEach((tag: string) => relevantTags.add(tag));
    });

    allNotes.forEach(note => {
      if (!relevantNoteIds.includes(note.id) && !relatedNotesMap.has(note.id)) {
        const sharedTags = note.tags?.filter((tag: string) => relevantTags.has(tag)) || [];
        if (sharedTags.length > 0) {
          relatedNotesMap.set(note.id, {
            note: {
              id: note.id,
              title: note.title,
              path: `/${note.type}/${note.title.replace(/\s+/g, '-').toLowerCase()}.md`,
              summary: note.content.substring(0, 100) + '...',
              type: note.type,
              similarity: 0,
              tags: note.tags || [],
              createdAt: note.created_at,
            },
            relationReason: 'shared_tags',
            relationScore: Math.min(sharedTags.length / 5, 1.0) * 0.7,
            relationDetails: {
              sharedTags,
            },
          });
        }
      }
    });

    // Add semantically similar notes
    scoredNotes
      .filter(note => !relevantNoteIds.includes(note.id) && !relatedNotesMap.has(note.id))
      .filter(note => note.similarity > 0.2 && note.similarity < 0.5)
      .slice(0, 5)
      .forEach(note => {
        relatedNotesMap.set(note.id, {
          note: {
            id: note.id,
            title: note.title,
            path: `/${note.type}/${note.title.replace(/\s+/g, '-').toLowerCase()}.md`,
            summary: note.content.substring(0, 100) + '...',
            type: note.type,
            similarity: note.similarity,
            tags: note.tags || [],
            createdAt: note.created_at,
          },
          relationReason: 'semantic',
          relationScore: note.similarity,
        });
      });

    const relatedNotes = Array.from(relatedNotesMap.values())
      .sort((a, b) => b.relationScore - a.relationScore)
      .slice(0, maxRelatedNotes);

    // Calculate suggested tags
    const tagCounts = new Map();
    const tagNotes = new Map();

    [...relevantNotes, ...relatedNotes.map(r => r.note)].forEach(note => {
      note.tags?.forEach((tag: string) => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        if (!tagNotes.has(tag)) {
          tagNotes.set(tag, []);
        }
        tagNotes.get(tag).push(note.id);
      });
    });

    const suggestedTags = Array.from(tagCounts.entries())
      .map(([tag, count]) => {
        const totalNotes = allNotes.filter((n: any) => n.tags?.includes(tag)).length;
        const confidence = Math.min((count / Math.max(relevantNotes.length, 1)) * 0.7 + 0.3, 1.0);
        
        return {
          tag,
          confidence,
          noteCount: totalNotes,
          reason: count >= 3 ? '出現在多個相關筆記中' : '與查詢相關',
        };
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxTags);

    const result = {
      query,
      relevantNotes,
      relatedNotes,
      suggestedTags,
      timestamp: new Date().toISOString(),
    };

    console.log('✅ Knowledge discovery completed:', {
      relevantCount: relevantNotes.length,
      relatedCount: relatedNotes.length,
      tagsCount: suggestedTags.length,
    });

    return c.json({ 
      success: true, 
      result 
    });
  } catch (error: any) {
    console.error('❌ Error in knowledge discovery:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, 500);
  }
});

export default app;
