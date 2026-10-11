import { useEffect, useState, type FormEvent } from 'react';
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
import { projectNameFromCapture, projectObjectiveFromCapture } from '@/lib/process-prefill';

export type ProcessProjectConfirmInput = {
  name: string;
  objective?: string;
  status: 'active' | 'someday';
};

type ProcessProjectSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capture: { id: string; content: string; sourceUrl?: string | null } | null;
  status: 'active' | 'someday';
  onConfirm: (captureId: string, input: ProcessProjectConfirmInput) => void;
  isLoading?: boolean;
  error?: string | null;
};

export function ProcessProjectSheet({
  open,
  onOpenChange,
  capture,
  status,
  onConfirm,
  isLoading = false,
  error = null,
}: ProcessProjectSheetProps) {
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');

  useEffect(() => {
    if (capture) {
      setName(projectNameFromCapture(capture.content));
      setObjective(
        projectObjectiveFromCapture({
          content: capture.content,
          sourceUrl: capture.sourceUrl,
        })
      );
    }
  }, [capture, status]);

  const trimmedName = name.trim();
  const title = status === 'someday' ? 'Someday project' : 'New project';

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!capture || !trimmedName) return;
    const trimmedObjective = objective.trim();
    onConfirm(capture.id, {
      name: trimmedName,
      status,
      ...(trimmedObjective ? { objective: trimmedObjective } : {}),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-process-project-sheet="" side="right" className="gap-0">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            Name is required. The objective starts from this capture and is editable.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
          <div className="space-y-4 px-4">
            <div className="space-y-2">
              <Label htmlFor="process-project-name">Name</Label>
              <Input
                id="process-project-name"
                data-process-project-name=""
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                disabled={isLoading}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="process-project-objective">Objective</Label>
              <textarea
                id="process-project-objective"
                data-process-project-objective=""
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                maxLength={2000}
                disabled={isLoading}
                rows={5}
                className="border-input dark:bg-input/30 w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              />
              {error ? (
                <p role="alert" data-process-project-error="" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="submit"
              data-process-project-submit=""
              disabled={isLoading || !trimmedName}
            >
              {isLoading ? 'Creating...' : title}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
