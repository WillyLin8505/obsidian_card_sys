// Database initialization utility
// This script checks and initializes the database tables

export async function checkDatabaseSchema(supabaseUrl: string, supabaseKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/notes?limit=1`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    });
    
    if (response.status === 404 || response.status === 406) {
      console.error('Notes table not found. Please run the SQL migration script.');
      return false;
    }
    
    return response.ok || response.status === 200;
  } catch (error) {
    console.error('Error checking database schema:', error);
    return false;
  }
}

export async function clearInvalidNotes(supabaseUrl: string, supabaseKey: string): Promise<void> {
  try {
    // This function would be used to clean up notes with invalid IDs
    // For now, we'll just log that cleanup is needed
    console.log('Database cleanup utility - please ensure all old data is cleared');
  } catch (error) {
    console.error('Error clearing invalid notes:', error);
  }
}
