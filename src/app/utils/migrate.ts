import { api } from './api';
import { Note } from '../types/note';

const NOTES_KEY = 'zettelkasten_notes';

/**
 * Migrate notes from localStorage to Supabase database
 */
export async function migrateToDatabase(): Promise<{ success: boolean; message: string; count?: number }> {
  try {
    // Get notes from localStorage
    const localNotesStr = localStorage.getItem(NOTES_KEY);
    if (!localNotesStr) {
      return {
        success: true,
        message: '沒有需要遷移的筆記',
        count: 0,
      };
    }

    const localNotes: Note[] = JSON.parse(localNotesStr);
    if (localNotes.length === 0) {
      return {
        success: true,
        message: '沒有需要遷移的筆記',
        count: 0,
      };
    }

    // Check if notes already exist in database
    const existingNotes = await api.notes.getAll();
    if (existingNotes.length > 0) {
      return {
        success: false,
        message: '資料庫中已有筆記，請先清空資料庫或手動處理衝突',
      };
    }

    // Migrate each note
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const note of localNotes) {
      try {
        await api.notes.create({
          title: note.title,
          content: note.content,
          type: note.type,
          tags: note.tags || [],
          links: note.links || [],
          sourceUrl: note.sourceUrl,
        });
        successCount++;
      } catch (error: any) {
        errorCount++;
        errors.push(`筆記 "${note.title}": ${error.message}`);
        console.error(`Error migrating note ${note.id}:`, error);
      }
    }

    if (errorCount > 0) {
      return {
        success: false,
        message: `遷移完成但有錯誤：成功 ${successCount} 則，失敗 ${errorCount} 則`,
        count: successCount,
      };
    }

    return {
      success: true,
      message: `成功遷移 ${successCount} 則筆記到資料庫`,
      count: successCount,
    };
  } catch (error: any) {
    console.error('Migration error:', error);
    return {
      success: false,
      message: `遷移失敗：${error.message}`,
    };
  }
}

/**
 * Backup localStorage data
 */
export function backupLocalStorage(): string {
  const data = {
    notes: localStorage.getItem(NOTES_KEY),
    config: localStorage.getItem('zettelkasten_config'),
    timestamp: new Date().toISOString(),
  };
  return JSON.stringify(data, null, 2);
}

/**
 * Download backup as file
 */
export function downloadBackup() {
  const backup = backupLocalStorage();
  const blob = new Blob([backup], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zettelkasten-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
