import { useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import { Button } from '@yoink/ui-base/components/button';
import {
  PILE_SAFETY_CAP,
  copyNoteTitle,
  type Note,
  type NoteListItem,
} from '@yoink/api-contracts';
import { notesClient, tsrNotes } from '@/api/client';
import { formatNoteListStamp } from '@/lib/format-note-list-line';
import { isFetchError } from '@ts-rest/react-query/v5';
import { toast } from 'sonner';
import { NoteEditorSheet, type NoteEditorDraft } from './note-editor-sheet';

const emptyDraft = (): NoteEditorDraft => ({
  title: '',
  body: '',
  version: null,
  noteId: null,
});

type ProjectNotesSectionProps = {
  projectId: string;
};

export function ProjectNotesSection({ projectId }: ProjectNotesSectionProps) {
  const queryClient = tsrNotes.useQueryClient();
  const listQuery = tsrNotes.list.useQuery({
    queryKey: ['notes', projectId],
    queryData: { params: { projectId }, query: { limit: PILE_SAFETY_CAP } },
  });
  const notes = listQuery.data?.status === 200 ? listQuery.data.body.notes : [];
  const notesReady = `${listQuery.data?.status === 200 ? listQuery.data.body.total : 'loading'}:${notes
    .map((note) => note.version)
    .join(',')}`;

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'read' | 'edit'>('edit');
  const [note, setNote] = useState<Note | null>(null);
  const [draft, setDraft] = useState<NoteEditorDraft>(emptyDraft());
  const [preview, setPreview] = useState(false);
  const [stale, setStale] = useState(false);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['notes', projectId] });
    await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'history'] });
  };

  const createMutation = tsrNotes.create.useMutation({
    onSuccess: async (result) => {
      if (result.status !== 201) {
        return;
      }
      setNote(result.body);
      setDraft({
        title: result.body.title,
        body: result.body.body,
        version: result.body.version,
        noteId: result.body.id,
      });
      setStale(false);
      setMode('read');
      toast.success('Note saved');
      await invalidate();
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      toast.error('Failed to save note');
    },
  });

  const updateMutation = tsrNotes.update.useMutation({
    onSuccess: async (result) => {
      if (result.status !== 200) {
        return;
      }
      setNote(result.body);
      setDraft({
        title: result.body.title,
        body: result.body.body,
        version: result.body.version,
        noteId: result.body.id,
      });
      setStale(false);
      setMode('read');
      toast.success('Note saved');
      await invalidate();
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      if (typeof err === 'object' && err !== null && 'status' in err && err.status === 409) {
        setStale(true);
        return;
      }
      toast.error('Failed to save note');
    },
  });

  const deleteMutation = tsrNotes.delete.useMutation({
    onSuccess: async () => {
      setOpen(false);
      setNote(null);
      setDraft(emptyDraft());
      toast.success('Note deleted');
      await invalidate();
    },
    onError: () => {
      toast.error('Failed to delete note');
    },
  });

  const openRead = async (item: NoteListItem) => {
    const result = await notesClient.get({
      params: { projectId, noteId: item.id },
    });
    if (result.status !== 200) {
      toast.error('Failed to open note');
      return;
    }
    setNote(result.body);
    setDraft({
      title: result.body.title,
      body: result.body.body,
      version: result.body.version,
      noteId: result.body.id,
    });
    setPreview(false);
    setStale(false);
    setMode('read');
    setOpen(true);
  };

  const startNew = () => {
    setNote(null);
    setDraft(emptyDraft());
    setPreview(false);
    setStale(false);
    setMode('edit');
    setOpen(true);
  };

  const save = () => {
    const title = draft.title.trim();
    if (!title) {
      return;
    }
    if (draft.noteId && draft.version) {
      updateMutation.mutate({
        params: { projectId, noteId: draft.noteId },
        body: { title, body: draft.body, expectedVersion: draft.version },
      });
      return;
    }
    createMutation.mutate({
      params: { projectId },
      body: { title, body: draft.body },
    });
  };

  const seeNewer = async () => {
    if (!draft.noteId) {
      return;
    }
    const result = await notesClient.get({
      params: { projectId, noteId: draft.noteId },
    });
    if (result.status !== 200) {
      toast.error('Failed to load the newer version');
      return;
    }
    setNote(result.body);
    setDraft({
      title: result.body.title,
      body: result.body.body,
      version: result.body.version,
      noteId: result.body.id,
    });
    setStale(false);
  };

  const saveCopy = () => {
    createMutation.mutate({
      params: { projectId },
      body: {
        title: copyNoteTitle(draft.title.trim() || 'Note'),
        body: draft.body,
      },
    });
  };

  const isPending =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <section
      data-project-notes=""
      data-notes-ready={listQuery.data?.status === 200 ? notesReady : undefined}
      className="space-y-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Notes</h2>
        <Button type="button" variant="outline" size="sm" data-note-add="" onClick={startNew}>
          <Plus className="size-4" />
          Add note
        </Button>
      </div>
      {notes.length === 0 ? (
        <p data-project-notes-empty="" className="text-sm text-muted-foreground">
          No notes yet
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                data-project-note={item.id}
                data-note-title={item.title}
                data-note-version={item.version}
                className="flex w-full items-start gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left"
                onClick={() => void openRead(item)}
              >
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-medium">{item.title}</span>
                  {item.excerpt ? (
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                      {item.excerpt}
                    </span>
                  ) : null}
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {formatNoteListStamp(item)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <NoteEditorSheet
        open={open}
        mode={mode}
        note={note}
        draft={draft}
        isPending={isPending}
        stale={stale}
        preview={preview}
        onDraftChange={setDraft}
        onPreviewChange={setPreview}
        onRequestClose={() => setOpen(false)}
        onForceClose={() => {
          setOpen(false);
          setDraft(emptyDraft());
          setNote(null);
          setStale(false);
        }}
        onSave={save}
        onEdit={() => setMode('edit')}
        onDelete={() => {
          if (draft.noteId) {
            deleteMutation.mutate({
              params: { projectId, noteId: draft.noteId },
              body: {},
            });
          }
        }}
        onSeeNewer={() => void seeNewer()}
        onSaveCopy={saveCopy}
      />
    </section>
  );
}
