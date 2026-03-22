import { Hono } from "npm:hono";
import { getSupabaseClient, generateId, getUserId } from "./db.tsx";

const app = new Hono();

// Create a link between notes
app.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { fromNoteId, toNoteId, linkType = 'manual', relationType } = body;

    if (!fromNoteId || !toNoteId) {
      return c.json({ error: "Missing required fields: fromNoteId, toNoteId" }, 400);
    }

    const supabase = getSupabaseClient();
    const linkId = generateId("link");
    const userId = await getUserId(c.req.header("Authorization"));

    const { data, error } = await supabase
      .from("note_links")
      .insert({
        id: linkId,
        user_id: userId,
        from_note_id: fromNoteId,
        to_note_id: toNoteId,
        link_type: linkType,
        relation_type: relationType,
        status: linkType === 'manual' ? 'accepted' : 'suggested',
      })
      .select()
      .single();

    if (error) {
      console.log("Error creating link:", error);
      return c.json({ error: error.message }, 500);
    }

    return c.json({ link: data }, 201);
  } catch (error: any) {
    console.log("Error in POST /links:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Get links for a note
app.get("/note/:noteId", async (c) => {
  try {
    const noteId = c.req.param("noteId");
    const supabase = getSupabaseClient();
    const userId = await getUserId(c.req.header("Authorization"));

    const { data, error } = await supabase
      .from("note_links")
      .select("*")
      .or(`from_note_id.eq.${noteId},to_note_id.eq.${noteId}`)
      .eq("user_id", userId)
      .eq("status", "accepted");

    if (error) {
      console.log("Error fetching links:", error);
      return c.json({ error: error.message }, 500);
    }

    return c.json({ links: data });
  } catch (error: any) {
    console.log("Error in GET /links/note/:noteId:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Delete a link
app.delete("/:linkId", async (c) => {
  try {
    const linkId = c.req.param("linkId");
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from("note_links")
      .delete()
      .eq("id", linkId);

    if (error) {
      console.log("Error deleting link:", error);
      return c.json({ error: error.message }, 500);
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.log("Error in DELETE /links/:linkId:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Accept or reject a suggested link
app.put("/:linkId/status", async (c) => {
  try {
    const linkId = c.req.param("linkId");
    const body = await c.req.json();
    const { status } = body;

    if (!['accepted', 'rejected'].includes(status)) {
      return c.json({ error: "Invalid status. Must be 'accepted' or 'rejected'" }, 400);
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("note_links")
      .update({ status })
      .eq("id", linkId)
      .select()
      .single();

    if (error) {
      console.log("Error updating link status:", error);
      return c.json({ error: error.message }, 500);
    }

    return c.json({ link: data });
  } catch (error: any) {
    console.log("Error in PUT /links/:linkId/status:", error);
    return c.json({ error: error.message }, 500);
  }
});

export default app;