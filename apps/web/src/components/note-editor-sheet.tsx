import { useEffect, useState } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { Input } from '@yoink/ui-base/components/input';
import { Label } from '@yoink/ui-base/components/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@yoink/ui-base/components/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@yoink/ui-base/components/dialog';
import { NOTE_BODY_MAX_LENGTH, NOTE_TITLE_MAX_LENGTH, type Note } from '@yoink/api-contracts';
import { NoteMarkdown } from './note-markdown';

export type NoteEditorDraft = {
  title: string;
  body: string;
  version: string | null;
  noteId: string | null;
};

type NoteEditorSheetProps = {
  open: boolean;
  mode: 'read' | 'edit';
  note: Note | null;
  draft: NoteEditorDraft;
  isPending: boolean;
  stale: boolean;
  preview: boolean;
  onDraftChange: (draft: NoteEditorDraft) => void;
  onPreviewChange: (preview: boolean) => void;
  onRequestClose: () => void;
  onForceClose: () => void;
  onSave: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSeeNewer: () => void;
  onSaveCopy: () => void;
};

export function NoteEditorSheet({
  open,
  mode,
  note,
  draft,
  isPending,
  stale,
  preview,
  onDraftChange,
  onPreviewChange,
  onRequestClose,
  onForceClose,
  onSave,
  onEdit,
  onDelete,
  onSeeNewer,
  onSaveCopy,
}: NoteEditorSheetProps) {
  const [discardOpen, setDiscardOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setDiscardOpen(false);
      setDeleteOpen(false);
    }
  }, [open]);

  const dirty =
    mode === 'edit' &&
    (draft.title !== (note?.title ?? '') || draft.body !== (note?.body ?? ''));

  const requestClose = () => {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onRequestClose();
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            requestClose();
          }
        }}
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          data-note-editor={mode === 'edit' ? '' : undefined}
          data-note-read={mode === 'read' ? '' : undefined}
          data-note-version={draft.version ?? note?.version ?? ''}
          className="flex h-[100dvh] max-h-[100dvh] flex-col gap-0 rounded-none px-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="px-4">
            <SheetTitle>{mode === 'read' ? note?.title ?? 'Note' : draft.noteId ? 'Edit note' : 'New note'}</SheetTitle>
            <SheetDescription className="sr-only">
              {mode === 'read' ? 'Read this project note' : 'Edit the title and markdown body'}
            </SheetDescription>
          </SheetHeader>

          {stale ? (
            <div
              data-note-stale=""
              className="mx-4 rounded-lg border border-warning-border bg-warning-muted px-3 py-2 text-sm text-warning-foreground"
            >
              <p>This note changed since you opened it</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" data-note-see-newer="" onClick={onSeeNewer}>
                  See the newer version
                </Button>
                <Button type="button" size="sm" variant="outline" data-note-save-copy="" onClick={onSaveCopy}>
                  Save mine as a copy
                </Button>
              </div>
            </div>
          ) : null}

          {mode === 'read' && note ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <NoteMarkdown body={note.body} />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
              <div className="space-y-2">
                <Label htmlFor="note-title">Title</Label>
                <Input
                  id="note-title"
                  data-note-title-input=""
                  value={draft.title}
                  maxLength={NOTE_TITLE_MAX_LENGTH}
                  disabled={isPending}
                  onChange={(event) =>
                    onDraftChange({ ...draft, title: event.target.value })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="note-body">Body</Label>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs"
                  data-note-preview-toggle=""
                  onClick={() => onPreviewChange(!preview)}
                >
                  {preview ? 'Edit' : 'Preview'}
                </Button>
              </div>
              {preview ? (
                <div data-note-preview="" className="min-h-40 rounded-md border border-border px-3 py-2">
                  <NoteMarkdown body={draft.body} />
                </div>
              ) : (
                <textarea
                  id="note-body"
                  data-note-body-input=""
                  value={draft.body}
                  maxLength={NOTE_BODY_MAX_LENGTH}
                  disabled={isPending}
                  onChange={(event) =>
                    onDraftChange({ ...draft, body: event.target.value })
                  }
                  className="border-input dark:bg-input/30 min-h-40 w-full flex-1 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                />
              )}
            </div>
          )}

          <SheetFooter className="flex-row justify-end gap-2 px-4">
            {mode === 'read' ? (
              <>
                <Button type="button" variant="outline" data-note-close="" onClick={onRequestClose}>
                  Close
                </Button>
                <Button type="button" variant="destructive" data-note-delete="" onClick={() => setDeleteOpen(true)}>
                  Delete
                </Button>
                <Button type="button" data-note-edit="" onClick={onEdit}>
                  Edit
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" data-note-cancel="" onClick={requestClose} disabled={isPending}>
                  Cancel
                </Button>
                <Button type="button" data-note-save="" onClick={onSave} disabled={isPending || draft.title.trim() === ''}>
                  {isPending ? 'Saving…' : 'Save'}
                </Button>
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent data-note-discard="" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>Your edits will be lost.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" data-note-keep-editing="" onClick={() => setDiscardOpen(false)}>
              Keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-note-discard-confirm=""
              onClick={() => {
                setDiscardOpen(false);
                onForceClose();
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent data-note-delete-confirm="" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete this note?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-note-delete-confirm-button=""
              onClick={() => {
                setDeleteOpen(false);
                onDelete();
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
