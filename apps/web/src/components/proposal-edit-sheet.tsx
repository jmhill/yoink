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
import type { Project, UpdateProject } from '@yoink/api-contracts';
import {
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_OBJECTIVE_MAX_LENGTH,
  PROJECT_REASON_MAX_LENGTH,
  PROJECT_SUGGESTED_NEXT_ACTION_MAX_LENGTH,
} from '@yoink/api-contracts';

type ProposalEditSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onSave: (projectId: string, input: UpdateProject) => void;
  isLoading?: boolean;
  error?: string | null;
};

export function ProposalEditSheet({
  open,
  onOpenChange,
  project,
  onSave,
  isLoading = false,
  error = null,
}: ProposalEditSheetProps) {
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [reason, setReason] = useState('');
  const [suggestedNextAction, setSuggestedNextAction] = useState('');

  useEffect(() => {
    if (!project) {
      return;
    }
    setName(project.name);
    setObjective(project.objective ?? '');
    setReason(project.reason ?? '');
    setSuggestedNextAction(project.suggestedNextAction ?? '');
  }, [project, open]);

  const trimmedName = name.trim();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!project || !trimmedName || isLoading) {
      return;
    }
    onSave(project.id, {
      name: trimmedName,
      objective: objective.trim() === '' ? null : objective.trim(),
      reason: reason.trim() === '' ? null : reason.trim(),
      suggestedNextAction: suggestedNextAction.trim() === '' ? null : suggestedNextAction.trim(),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-proposal-edit-sheet="" side="right" className="gap-0">
        <SheetHeader>
          <SheetTitle>Edit proposal</SheetTitle>
          <SheetDescription>Name is required.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
          <div className="space-y-4 px-4">
            <div className="space-y-2">
              <Label htmlFor="proposal-edit-name">Name</Label>
              <Input
                id="proposal-edit-name"
                data-proposal-edit-name=""
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={PROJECT_NAME_MAX_LENGTH}
                disabled={isLoading}
                autoFocus
              />
              {error ? (
                <p role="alert" data-proposal-edit-error="" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="proposal-edit-objective">Objective</Label>
              <textarea
                id="proposal-edit-objective"
                data-proposal-edit-objective=""
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                maxLength={PROJECT_OBJECTIVE_MAX_LENGTH}
                disabled={isLoading}
                rows={Math.max(3, objective.split(/\r?\n/).length)}
                className="border-input dark:bg-input/30 field-sizing-content w-full min-h-24 min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proposal-edit-reason">Reason</Label>
              <Input
                id="proposal-edit-reason"
                data-proposal-edit-reason=""
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={PROJECT_REASON_MAX_LENGTH}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proposal-edit-next">Suggested next action</Label>
              <Input
                id="proposal-edit-next"
                data-proposal-edit-next=""
                value={suggestedNextAction}
                onChange={(event) => setSuggestedNextAction(event.target.value)}
                maxLength={PROJECT_SUGGESTED_NEXT_ACTION_MAX_LENGTH}
                disabled={isLoading}
              />
            </div>
          </div>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" data-proposal-edit-submit="" disabled={isLoading || !trimmedName}>
              {isLoading ? 'Saving...' : 'Save'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
