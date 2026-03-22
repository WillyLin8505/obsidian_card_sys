import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

export const getSupabaseClient = () => {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
};

// System user ID for development (使用固定的 UUID)
// 在生產環境中，這應該替換為真實的用戶認證
export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

// Helper to get user ID from request or use system user
export const getUserId = async (authHeader?: string): Promise<string> => {
  // 如果有 Authorization header，嘗試從 token 獲取用戶 ID
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const supabase = getSupabaseClient();
    
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (user && !error) {
        return user.id;
      }
    } catch (error) {
      console.log("Failed to get user from token, using system user:", error);
    }
  }
  
  // 否則使用系統用戶 ID
  return SYSTEM_USER_ID;
};

// Ensure system user exists
export const ensureSystemUser = async () => {
  const supabase = getSupabaseClient();
  
  try {
    // Check if system user exists
    const { data, error } = await supabase.auth.admin.getUserById(SYSTEM_USER_ID);
    
    if (error || !data.user) {
      // Create system user
      console.log("Creating system user...");
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        id: SYSTEM_USER_ID,
        email: "system@zettelkasten.local",
        email_confirm: true,
        user_metadata: {
          name: "System User",
          role: "system",
        },
      });
      
      if (createError) {
        console.error("Failed to create system user:", createError);
      } else {
        console.log("System user created successfully:", newUser.user?.id);
      }
    } else {
      console.log("System user already exists:", SYSTEM_USER_ID);
    }
  } catch (error) {
    console.error("Error ensuring system user:", error);
  }
};

// Helper to generate UUIDs
export const generateId = (_prefix?: string) => {
  // Generate a standard UUID v4
  return crypto.randomUUID();
};

// Helper to calculate content hash
export const calculateHash = (content: string): string => {
  // Simple hash function - in production, use crypto.subtle.digest
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
};