import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { Checkbox } from '@yoink/ui-base/components/checkbox';
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
import type { ConfirmableProjectStatus, ConfirmProposedProject, Project } from '@yoink/api-contracts';
import {
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_OBJECTIVE_MAX_LENGTH,
  PROJECT_SUGGESTED_NEXT_ACTION_MAX_LENGTH,
  PROJECT_WAITING_ON_MAX_LENGTH,
} from '@yoink/api-contracts';
import { localDateString } from '@/lib/format-waiting-line';

const STATUS_OPTIONS: Array<{ value: ConfirmableProjectStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'someday', label: 'Someday' },
  { value: 'waiting', label: 'Waiting' },
];

type ConfirmProposalSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onConfirm: (projectId: string, input: ConfirmProposedProject) => void;
  isLoading?: boolean;
  error?: string | null;
};

export function ConfirmProposalSheet({
  open,
  onOpenChange,
  project,
  onConfirm,
  isLoading = false,
  error = null,
}: ConfirmProposalSheetProps) {
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [status, setStatus] = useState<ConfirmableProjectStatus>('active');
  const [suggestedNextAction, setSuggestedNextAction] = useState('');
  const [waitingOn, setWaitingOn] = useState('');
  const [waitingSince, setWaitingSince] = useState(localDateString());
  const [dontKnow, setDontKnow] = useState(false);
  const [sinceError, setSinceError] = useState<string | null>(null);

  useEffect(() => {
    if (!project) {
      return;
    }
    setName(project.name);
    setObjective(project.objective ?? '');
    setStatus('active');
    setSuggestedNextAction(project.suggestedNextAction ?? '');
    setWaitingOn('');
    setWaitingSince(localDateString());
    setDontKnow(false);
    setSinceError(null);
  }, [project, open]);

  const trimmedName = name.trim();
  const waitingReady = status !== 'waiting' || waitingOn.trim() !== '';

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!project || !trimmedName || isLoading) {
      return;
    }
    if (status === 'waiting' && !dontKnow && waitingSince === '') {
      setSinceError('Choose a date, or check Don’t know');
      return;
    }
    const trimmedObjective = objective.trim();
    const trimmedSuggested = suggestedNextAction.trim();
    onConfirm(project.id, {
      name: trimmedName,
      objective: trimmedObjective === '' ? null : trimmedObjective,
      status,
      suggestedNextAction: trimmedSuggested === '' ? null : trimmedSuggested,
      ...(status === 'waiting'
        ? {
            waitingOn: waitingOn.trim(),
            waitingSince: dontKnow ? null : waitingSince,
          }
        : {}),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-confirm-proposal-sheet="" side="right" className="gap-0">
        <SheetHeader>
          <SheetTitle>Confirm project</SheetTitle>
          <SheetDescription>
            Name is required. Status starts as Active.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
          <div className="space-y-4 px-4">
            <div className="space-y-2">
              <Label htmlFor="confirm-proposal-name">Name</Label>
              <Input
                id="confirm-proposal-name"
                data-confirm-proposal-name=""
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={PROJECT_NAME_MAX_LENGTH}
                disabled={isLoading}
                autoFocus
              />
              {error ? (
                <p role="alert" data-confirm-proposal-error="" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-proposal-objective">Objective</Label>
              <textarea
                id="confirm-proposal-objective"
                data-confirm-proposal-objective=""
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                maxLength={PROJECT_OBJECTIVE_MAX_LENGTH}
                disabled={isLoading}
                rows={Math.max(3, objective.split(/\r?\n/).length)}
                className="border-input dark:bg-input/30 field-sizing-content w-full min-h-24 min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Status</legend>
              <div className="flex flex-wrap gap-3">
                {STATUS_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="confirm-proposal-status"
                      data-confirm-proposal-status={option.value}
                      checked={status === option.value}
                      onChange={() => setStatus(option.value)}
                      disabled={isLoading}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
            {status === 'waiting' ? (
              <div className="grid gap-3" data-confirm-proposal-waiting="">
                <div className="space-y-1">
                  <Label htmlFor="confirm-proposal-waiting-on">Waiting on</Label>
                  <Input
                    id="confirm-proposal-waiting-on"
                    data-confirm-proposal-waiting-on=""
                    value={waitingOn}
                    onChange={(event) => setWaitingOn(event.target.value)}
                    maxLength={PROJECT_WAITING_ON_MAX_LENGTH}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="confirm-proposal-waiting-since">Since</Label>
                  <Input
                    id="confirm-proposal-waiting-since"
                    data-confirm-proposal-waiting-since=""
                    type="date"
                    value={waitingSince}
                    onChange={(event) => {
                      setWaitingSince(event.target.value);
                      setSinceError(null);
                    }}
                    disabled={isLoading || dontKnow}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    data-confirm-proposal-waiting-unknown=""
                    checked={dontKnow}
                    onCheckedChange={(checked) => {
                      setDontKnow(checked === true);
                      setSinceError(null);
                      if (checked === true) {
                        setWaitingSince(localDateString());
                      }
                    }}
                    disabled={isLoading}
                  />
                  Don’t know
                </label>
                {sinceError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {sinceError}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="confirm-proposal-next">Suggested next action</Label>
              <Input
                id="confirm-proposal-next"
                data-confirm-proposal-next=""
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
            <Button
              type="submit"
              data-confirm-proposal-submit=""
              disabled={isLoading || !trimmedName || !waitingReady}
            >
              {isLoading ? 'Confirming...' : 'Confirm'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
