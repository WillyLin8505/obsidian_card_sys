import { Hono } from "npm:hono";
import { getSupabaseClient } from "./db.tsx";

const app = new Hono();

// Initialize/Reset database
app.post("/reset", async (c) => {
  try {
    const supabase = getSupabaseClient();
    
    // Delete all existing data (hard delete - use with caution)
    // Using gt to select all rows (id > '00000000-0000-0000-0000-000000000000')
    await supabase.from("note_links").delete().gt("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("note_tags").delete().gt("note_id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("note_chunks").delete().gt("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("sources").delete().gt("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("attachments").delete().gt("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("notes").delete().gt("id", "00000000-0000-0000-0000-000000000000");
    
    console.log("Database reset completed");
    
    return c.json({ 
      success: true, 
      message: "Database has been reset successfully"
    });
  } catch (error: any) {
    console.log("Error resetting database:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Check database schema
app.get("/check", async (c) => {
  try {
    const supabase = getSupabaseClient();
    
    // Try to query the notes table (without content field)
    const { data, error } = await supabase
      .from("notes")
      .select("id, title, note_type")
      .limit(1);
    
    if (error) {
      console.log("Database check error:", error);
      return c.json({ 
        healthy: false, 
        error: error.message,
        hint: "Please execute the SQL migration script at /supabase/migrations/001_knowledge_base_schema.sql in your Supabase SQL Editor"
      }, 500);
    }
    
    return c.json({ 
      healthy: true, 
      message: "Database schema is correctly initialized",
      recordCount: data?.length || 0
    });
  } catch (error: any) {
    console.log("Error checking database:", error);
    return c.json({ 
      healthy: false, 
      error: error.message 
    }, 500);
  }
});

// Get SQL migration script content
app.get("/migration-sql", async (c) => {
  const migrationInstructions = `
-- This SQL script should be executed in your Supabase SQL Editor
-- Go to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql

-- First, drop existing tables if they exist (CAUTION: This will delete all data)
DROP TABLE IF EXISTS processing_jobs CASCADE;
DROP TABLE IF EXISTS sync_log CASCADE;
DROP TABLE IF EXISTS attachments CASCADE;
DROP TABLE IF EXISTS sources CASCADE;
DROP TABLE IF EXISTS note_links CASCADE;
DROP TABLE IF EXISTS chunk_entities CASCADE;
DROP TABLE IF EXISTS note_entities CASCADE;
DROP TABLE IF EXISTS entities CASCADE;
DROP TABLE IF EXISTS note_tags CASCADE;
DROP TABLE IF EXISTS tags CASCADE;
DROP TABLE IF EXISTS note_chunks CASCADE;
DROP TABLE IF EXISTS notes CASCADE;

-- Now run the full schema from /supabase/migrations/001_knowledge_base_schema.sql
-- Copy and paste the content of that file into the SQL Editor and execute it.
`;

  return c.text(migrationInstructions);
});

export default app;