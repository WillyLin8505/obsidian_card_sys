import { Hono } from "npm:hono";
import { getSupabaseClient } from "./db.tsx";

const app = new Hono();

// Test database connection and schema
app.get("/", async (c) => {
  try {
    const supabase = getSupabaseClient();
    
    // Check if notes table exists
    const { data, error } = await supabase
      .from("notes")
      .select("id")
      .limit(1);

    if (error) {
      return c.json({
        success: false,
        error: error.message,
        hint: "Please execute the SQL migration file first: /supabase/migrations/001_knowledge_base_schema.sql",
        details: error,
      }, 500);
    }

    return c.json({
      success: true,
      message: "Database connection successful",
      notesCount: data?.length || 0,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message,
      hint: "Please execute the SQL migration file first",
    }, 500);
  }
});

export default app;
