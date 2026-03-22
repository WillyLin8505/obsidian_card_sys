import { Hono } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";

const app = new Hono();

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// POST /ai-search - Submit a question and store Claude's search result
app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { question, answer, chunks, searchTime, metadata } = body;

    if (!question || !answer) {
      return c.json({ 
        success: false, 
        error: 'Question and answer are required' 
      }, 400);
    }

    console.log('📝 Storing AI search result:', { question, chunksCount: chunks?.length || 0 });

    // Store the search result in Supabase
    const searchResult = {
      question,
      answer,
      chunks: chunks || [],
      connection_status: 'connected',
      search_time: searchTime || 0,
      metadata: metadata || {},
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('ai_search_results')
      .insert([searchResult])
      .select()
      .single();

    if (error) {
      console.error('❌ Error storing AI search result:', error);
      return c.json({ 
        success: false, 
        error: `Failed to store search result: ${error.message}` 
      }, 500);
    }

    console.log('✅ AI search result stored successfully:', data.id);

    return c.json({ 
      success: true, 
      result: {
        id: data.id,
        question: data.question,
        answer: data.answer,
        chunks: data.chunks,
        connectionStatus: data.connection_status,
        searchTime: data.search_time,
        createdAt: data.created_at,
        metadata: data.metadata,
      }
    });
  } catch (error: any) {
    console.error('❌ Error in AI search endpoint:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, 500);
  }
});

// GET /ai-search - Get all AI search history
app.get('/', async (c) => {
  try {
    console.log('📋 Fetching AI search history');

    const { data, error } = await supabase
      .from('ai_search_results')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching AI search history:', error);
      return c.json({ 
        success: false, 
        error: `Failed to fetch search history: ${error.message}` 
      }, 500);
    }

    const results = data.map(row => ({
      id: row.id,
      question: row.question,
      answer: row.answer,
      chunks: row.chunks,
      connectionStatus: row.connection_status,
      searchTime: row.search_time,
      createdAt: row.created_at,
      metadata: row.metadata,
    }));

    console.log(`✅ Fetched ${results.length} AI search results`);

    return c.json({ 
      success: true, 
      results 
    });
  } catch (error: any) {
    console.error('❌ Error fetching AI search history:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, 500);
  }
});

// GET /ai-search/:id - Get a specific AI search result
app.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    console.log('🔍 Fetching AI search result:', id);

    const { data, error } = await supabase
      .from('ai_search_results')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('❌ Error fetching AI search result:', error);
      return c.json({ 
        success: false, 
        error: `Failed to fetch search result: ${error.message}` 
      }, 500);
    }

    if (!data) {
      return c.json({ 
        success: false, 
        error: 'Search result not found' 
      }, 404);
    }

    const result = {
      id: data.id,
      question: data.question,
      answer: data.answer,
      chunks: data.chunks,
      connectionStatus: data.connection_status,
      searchTime: data.search_time,
      createdAt: data.created_at,
      metadata: data.metadata,
    };

    console.log('✅ Fetched AI search result:', id);

    return c.json({ 
      success: true, 
      result 
    });
  } catch (error: any) {
    console.error('❌ Error fetching AI search result:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, 500);
  }
});

// DELETE /ai-search/:id - Delete a specific AI search result
app.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    console.log('🗑️ Deleting AI search result:', id);

    const { error } = await supabase
      .from('ai_search_results')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('❌ Error deleting AI search result:', error);
      return c.json({ 
        success: false, 
        error: `Failed to delete search result: ${error.message}` 
      }, 500);
    }

    console.log('✅ Deleted AI search result:', id);

    return c.json({ 
      success: true, 
      message: 'Search result deleted successfully' 
    });
  } catch (error: any) {
    console.error('❌ Error deleting AI search result:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, 500);
  }
});

export default app;
