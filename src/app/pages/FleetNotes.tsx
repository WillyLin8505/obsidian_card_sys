import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { storage, sortByRecentActivity } from '../utils/storage';
import { Note } from '../types/note';
import { NoteCard } from '../components/NoteCard';
import { Plus } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { buildNoteContent } from '../utils/buildNoteContent';

export function FleetNotes() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      setLoading(true);
      const allNotes = await storage.getNotes();
      const fleetNotes = allNotes.filter(n => n.type === 'fleet');
      setNotes(sortByRecentActivity(fleetNotes));
    } catch (error) {
      console.error('Error loading fleet notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const createNewNote = async () => {
    const config = storage.getConfig();

    const newNote: Note = {
      id: '',
      title: '新閃念筆記',
      content: buildNoteContent(config.fleetNoteTemplate),
      type: 'fleet',
      tags: config.fleetNoteTags || [],
      links: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    try {
      const createdNote = await storage.addNote(newNote);
      navigate(`/fleet-notes/${createdNote.id}`);
    } catch (error) {
      console.error('Failed to create note:', error);
      toast.error('創建筆記失敗');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="mb-2">閃念筆記</h1>
          <p className="text-gray-600">快速記錄您的想法和靈感</p>
        </div>
        <Button onClick={createNewNote} className="flex items-center gap-2">
          <Plus className="size-5" />
          新增筆記
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">
          載入中...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {notes.map(note => (
              <NoteCard
                key={note.id}
                note={note}
                onClick={(e) => {
                  if (e?.ctrlKey || e?.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                  navigate(`/fleet-notes/${note.id}`);
                }}
                onLinkClick={() => navigate('/permanent-notes', { state: { linkingNoteId: note.id } })}
              />
            ))}
          </div>

          {notes.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              尚無閃念筆記，點擊右上角的按鈕創建第一則筆記
            </div>
          )}
        </>
      )}
    </div>
  );
}