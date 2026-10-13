import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { Input } from '@yoink/ui-base/components/input';
import { Label } from '@yoink/ui-base/components/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@yoink/ui-base/components/dialog';
import type { Project } from '@yoink/api-contracts';
import { NOTEBOOK_PAGES_MAX } from '@yoink/api-contracts';

type EditProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  isPending: boolean;
  error: string | null;
  onSave: (input: { name: string; objective: string | null; notebookPages: string[] }) => void;
  onClearError: () => void;
};

export function EditProjectDialog({
  open,
  onOpenChange,
  project,
  isPending,
  error,
  onSave,
  onClearError,
}: EditProjectDialogProps) {
  const [name, setName] = useState(project.name);
  const [objective, setObjective] = useState(project.objective ?? '');
  const [pages, setPages] = useState(project.notebookPages.map((page) => page.path));
  const [newPage, setNewPage] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(project.name);
    setObjective(project.objective ?? '');
    setPages(project.notebookPages.map((page) => page.path));
    setNewPage('');
    setLocalError(null);
  }, [open, project]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || isPending) {
      if (!trimmedName) {
        setLocalError('Name is required');
      }
      return;
    }
    onSave({
      name: trimmedName,
      objective: objective.trim() === '' ? null : objective.trim(),
      notebookPages: pages,
    });
  };

  const addNewPage = () => {
    const trimmed = newPage.trim();
    if (!trimmed) {
      return;
    }
    setPages([...pages, trimmed]);
    setNewPage('');
  };

  const formError = localError ?? error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-project-edit-dialog="">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>Change the name, objective, or notebook links.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-page-name">Name</Label>
            <Input
              id="project-page-name"
              data-project-name-input=""
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setLocalError(null);
                onClearError();
              }}
              maxLength={200}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-page-objective">Objective</Label>
            <textarea
              id="project-page-objective"
              data-project-objective-input=""
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              maxLength={2000}
              rows={5}
              disabled={isPending}
              className="border-input dark:bg-input/30 w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            />
          </div>
          <div className="space-y-2">
            <Label>Notebook links</Label>
            <ul className="space-y-2">
              {pages.map((path, index) => (
                <li key={index} className="flex items-center gap-2">
                  <Input
                    data-notebook-page-input={index}
                    value={path}
                    onChange={(event) => {
                      const next = [...pages];
                      next[index] = event.target.value;
                      setPages(next);
                    }}
                    disabled={isPending}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPages(pages.filter((_, pageIndex) => pageIndex !== index))}
                    disabled={isPending}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
            {pages.length < NOTEBOOK_PAGES_MAX ? (
              <div className="flex items-center gap-2">
                <Input
                  data-notebook-page-input="new"
                  value={newPage}
                  placeholder="notes/Page.md"
                  onChange={(event) => setNewPage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') {
                      return;
                    }
                    event.preventDefault();
                    addNewPage();
                  }}
                  disabled={isPending}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addNewPage}
                  disabled={isPending}
                >
                  Add
                </Button>
              </div>
            ) : null}
          </div>
          {formError ? (
            <p role="alert" data-project-save-error="" className="text-sm text-destructive">
              {formError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" data-project-save="" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
