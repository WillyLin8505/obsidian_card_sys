import { Hono } from "npm:hono";
import { getSupabaseClient, generateId, calculateHash, getUserId } from "./db.tsx";

const app = new Hono();

// Search notes - MUST be before /:id route
app.get("/search", async (c) => {
  try {
    const query = c.req.query("q") || "";
    const type = c.req.query("type");
    const supabase = getSupabaseClient();
    const userId = await getUserId(c.req.header("Authorization"));

    // Build base query for notes
    let notesQuery = supabase
      .from("notes")
      .select(`
        id,
        title,
        note_type,
        source_url,
        created_at,
        updated_at,
        note_tags (
          tag_id,
          tags (
            id,
            name
          )
        )
      `)
      .eq("user_id", userId)
      .eq("status", "active");

    // Filter by type if provided
    if (type) {
      notesQuery = notesQuery.eq("note_type", type);
    }

    // Search in title if query provided
    if (query) {
      notesQuery = notesQuery.ilike("title", `%${query}%`);
    }

    const { data: notesData, error: notesError } = await notesQuery.order("updated_at", { ascending: false });

    if (notesError) {
      console.log("Error searching notes:", notesError);
      return c.json({ error: notesError.message }, 500);
    }

    // Get note IDs to search in content
    const noteIds = notesData?.map((n: any) => n.id) || [];
    
    // Also search in chunks if query provided
    let matchingNoteIds = new Set(noteIds);
    if (query && noteIds.length > 0) {
      const { data: chunks, error: chunksError } = await supabase
        .from("note_chunks")
        .select("note_id")
        .in("note_id", noteIds)
        .ilike("content", `%${query}%`);

      if (!chunksError && chunks) {
        chunks.forEach((chunk: any) => matchingNoteIds.add(chunk.note_id));
      }
    }

    // Filter notes to only matching ones
    const matchingNotes = notesData?.filter((note: any) => 
      !query || matchingNoteIds.has(note.id)
    ) || [];

    // Get content for matching notes
    const { data: chunks, error: chunksError } = await supabase
      .from("note_chunks")
      .select("note_id, content, chunk_index")
      .in("note_id", Array.from(matchingNoteIds))
      .order("note_id")
      .order("chunk_index");

    if (chunksError) {
      console.log("Error fetching chunks:", chunksError);
    }

    // Group chunks by note_id
    const chunksMap = new Map();
    chunks?.forEach((chunk: any) => {
      if (!chunksMap.has(chunk.note_id)) {
        chunksMap.set(chunk.note_id, []);
      }
      chunksMap.get(chunk.note_id).push(chunk.content);
    });

    // Transform notes
    const notes = matchingNotes.map((note: any) => ({
      id: note.id,
      title: note.title,
      content: chunksMap.get(note.id)?.join("\n\n") || "",
      type: note.note_type,
      tags: note.note_tags?.map((nt: any) => nt.tags.name) || [],
      links: [],
      sourceUrl: note.source_url,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
    }));

    return c.json({ notes });
  } catch (error: any) {
    console.log("Error in GET /notes/search:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Get all notes
app.get("/", async (c) => {
  try {
    const supabase = getSupabaseClient();
    const userId = await getUserId(c.req.header("Authorization"));
    
    // Get notes with their chunks
    const { data: notesData, error: notesError } = await supabase
      .from("notes")
      .select(`
        id,
        title,
        note_type,
        source_url,
        created_at,
        updated_at,
        note_tags (
          tag_id,
          tags (
            id,
            name
          )
        )
      `)
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false });

    if (notesError) {
      console.log("Error fetching notes:", notesError);
      return c.json({ error: notesError.message }, 500);
    }

    // Get all chunks for these notes
    const noteIds = notesData.map((n: any) => n.id);
    const { data: chunks, error: chunksError } = await supabase
      .from("note_chunks")
      .select("note_id, content, chunk_index")
      .in("note_id", noteIds)
      .order("note_id")
      .order("chunk_index");

    if (chunksError) {
      console.log("Error fetching chunks:", chunksError);
      return c.json({ error: chunksError.message }, 500);
    }

    // Group chunks by note_id
    const chunksMap = new Map();
    chunks?.forEach((chunk: any) => {
      if (!chunksMap.has(chunk.note_id)) {
        chunksMap.set(chunk.note_id, []);
      }
      chunksMap.get(chunk.note_id).push(chunk.content);
    });

    // Transform the data to match frontend format
    const notes = notesData.map((note: any) => ({
      id: note.id,
      title: note.title,
      content: chunksMap.get(note.id)?.join("\n\n") || "",
      type: note.note_type,
      tags: note.note_tags.map((nt: any) => nt.tags.name),
      links: [], // Will be populated separately
      sourceUrl: note.source_url,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
    }));

    return c.json({ notes });
  } catch (error: any) {
    console.log("Error in GET /notes:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Get a single note by ID
app.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const supabase = getSupabaseClient();
    const userId = await getUserId(c.req.header("Authorization"));
    
    // Get note metadata
    const { data, error } = await supabase
      .from("notes")
      .select(`
        id,
        title,
        note_type,
        source_url,
        created_at,
        updated_at,
        note_tags (
          tag_id,
          tags (
            id,
            name
          )
        ),
        note_links_from:note_links!from_note_id (
          to_note_id
        ),
        note_links_to:note_links!to_note_id (
          from_note_id
        )
      `)
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error) {
      console.log("Error fetching note:", error);
      return c.json({ error: error.message }, 404);
    }

    // Get note content from chunks
    const { data: chunks, error: chunksError } = await supabase
      .from("note_chunks")
      .select("content, chunk_index")
      .eq("note_id", id)
      .order("chunk_index");

    if (chunksError) {
      console.log("Error fetching chunks:", chunksError);
      return c.json({ error: chunksError.message }, 500);
    }

    const content = chunks?.map((c: any) => c.content).join("\n\n") || "";

    // Get linked note IDs
    const links = [
      ...data.note_links_from.map((l: any) => l.to_note_id),
      ...data.note_links_to.map((l: any) => l.from_note_id)
    ];

    const note = {
      id: data.id,
      title: data.title,
      content,
      type: data.note_type,
      tags: data.note_tags.map((nt: any) => nt.tags.name),
      links: [...new Set(links)], // Remove duplicates
      sourceUrl: data.source_url,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    return c.json({ note });
  } catch (error: any) {
    console.log("Error in GET /notes/:id:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Create a new note
app.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { title, content, type, tags = [], sourceUrl } = body;

    if (!title || !content || !type) {
      return c.json({ error: "Missing required fields: title, content, type" }, 400);
    }

    const supabase = getSupabaseClient();
    const noteId = generateId("note");
    const contentHash = calculateHash(content);
    const userId = await getUserId(c.req.header("Authorization"));

    // Insert note (without content field)
    const { data: note, error: noteError } = await supabase
      .from("notes")
      .insert({
        id: noteId,
        title,
        note_type: type,
        source_url: sourceUrl,
        content_hash: contentHash,
        file_path: `/notes/${noteId}.md`,
        user_id: userId,
      })
      .select()
      .single();

    if (noteError) {
      console.log("Error creating note:", noteError);
      return c.json({ error: noteError.message }, 500);
    }

    // Insert content as a chunk
    const chunkId = generateId("chunk");
    const { error: chunkError } = await supabase
      .from("note_chunks")
      .insert({
        id: chunkId,
        note_id: noteId,
        user_id: userId,
        chunk_index: 0,
        content,
        char_count: content.length,
      });

    if (chunkError) {
      console.log("Error creating chunk:", chunkError);
      // Cleanup: delete the note if chunk creation fails
      await supabase.from("notes").delete().eq("id", noteId);
      return c.json({ error: chunkError.message }, 500);
    }

    // Handle tags
    if (tags.length > 0) {
      for (const tagName of tags) {
        // Get or create tag
        let { data: tag, error: tagError } = await supabase
          .from("tags")
          .select("id")
          .eq("user_id", userId)
          .eq("name", tagName)
          .maybeSingle();

        if (!tag) {
          const { data: newTag, error: createError } = await supabase
            .from("tags")
            .insert({ 
              name: tagName,
              user_id: userId,
            })
            .select()
            .single();

          if (createError) {
            console.log("Error creating tag:", createError);
            continue;
          }
          tag = newTag;
        }

        // Create note-tag relationship
        await supabase.from("note_tags").insert({
          note_id: noteId,
          tag_id: tag.id,
        });
      }
    }

    return c.json({
      note: {
        id: note.id,
        title: note.title,
        content,
        type: note.note_type,
        tags,
        links: [],
        sourceUrl: note.source_url,
        createdAt: note.created_at,
        updatedAt: note.updated_at,
      },
    }, 201);
  } catch (error: any) {
    console.log("Error in POST /notes:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Update a note
app.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const { title, content, tags } = body;

    const supabase = getSupabaseClient();
    const userId = await getUserId(c.req.header("Authorization"));
    const updates: any = {};

    if (title !== undefined) updates.title = title;
    if (content !== undefined) {
      updates.content_hash = calculateHash(content);
    }

    // Update note metadata
    const { data: note, error: noteError } = await supabase
      .from("notes")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (noteError) {
      console.log("Error updating note:", noteError);
      return c.json({ error: noteError.message }, 500);
    }

    // Update content in chunks if provided
    if (content !== undefined) {
      // Delete existing chunks
      await supabase.from("note_chunks").delete().eq("note_id", id);

      // Insert new chunk
      const chunkId = generateId("chunk");
      const { error: chunkError } = await supabase
        .from("note_chunks")
        .insert({
          id: chunkId,
          note_id: id,
          user_id: userId,
          chunk_index: 0,
          content,
          char_count: content.length,
        });

      if (chunkError) {
        console.log("Error updating chunk:", chunkError);
        return c.json({ error: chunkError.message }, 500);
      }
    }

    // Update tags if provided
    if (tags !== undefined) {
      // Remove existing tags
      await supabase.from("note_tags").delete().eq("note_id", id);

      // Add new tags
      for (const tagName of tags) {
        let { data: tag } = await supabase
          .from("tags")
          .select("id")
          .eq("user_id", userId)
          .eq("name", tagName)
          .maybeSingle();

        if (!tag) {
          const { data: newTag } = await supabase
            .from("tags")
            .insert({ 
              name: tagName,
              user_id: userId,
            })
            .select()
            .single();
          tag = newTag;
        }

        if (tag) {
          await supabase.from("note_tags").insert({
            note_id: id,
            tag_id: tag.id,
          });
        }
      }
    }

    // Get updated content from chunks
    const { data: chunks } = await supabase
      .from("note_chunks")
      .select("content")
      .eq("note_id", id)
      .order("chunk_index");

    const updatedContent = chunks?.map((c: any) => c.content).join("\n\n") || "";

    // Get updated tags
    const { data: noteTags } = await supabase
      .from("note_tags")
      .select(`
        tags (
          name
        )
      `)
      .eq("note_id", id);

    const updatedTags = noteTags?.map((nt: any) => nt.tags.name) || [];

    return c.json({ 
      note: {
        id: note.id,
        title: note.title,
        content: updatedContent,
        type: note.note_type,
        tags: updatedTags,
        links: [],
        sourceUrl: note.source_url,
        createdAt: note.created_at,
        updatedAt: note.updated_at,
      } 
    });
  } catch (error: any) {
    console.log("Error in PUT /notes/:id:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Delete a note (soft delete)
app.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from("notes")
      .update({ status: "deleted" })
      .eq("id", id);

    if (error) {
      console.log("Error deleting note:", error);
      return c.json({ error: error.message }, 500);
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.log("Error in DELETE /notes/:id:", error);
    return c.json({ error: error.message }, 500);
  }
});

export default app;