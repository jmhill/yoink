import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@yoink/ui-base/components/select';
import type { AssignableProjectStatus, Project } from '@yoink/api-contracts';
import { localDateString, waitingLineParts } from '@/lib/format-waiting-line';

const STATUS_OPTIONS: Array<{ value: AssignableProjectStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'someday', label: 'Someday' },
  { value: 'done', label: 'Done' },
];

const statusLabel = (status: Project['status']): string => {
  const option = STATUS_OPTIONS.find((item) => item.value === status);
  return option?.label ?? status;
};

type ProjectStatusControlProps = {
  project: Project;
  openTaskCount: number;
  isPending: boolean;
  error: string | null;
  onChangeStatus: (input: {
    status: AssignableProjectStatus;
    waitingOn?: string | null;
    waitingSince?: string | null;
    openTasks?: 'complete' | 'remove';
  }) => void;
};

export function ProjectStatusControl({
  project,
  openTaskCount,
  isPending,
  error,
  onChangeStatus,
}: ProjectStatusControlProps) {
  const [draftWaiting, setDraftWaiting] = useState(project.status === 'waiting');
  const [waitingOn, setWaitingOn] = useState(project.waitingOn ?? '');
  const [waitingSince, setWaitingSince] = useState(
    project.waitingSince ?? localDateString()
  );
  const [doneOpen, setDoneOpen] = useState(false);

  useEffect(() => {
    setDraftWaiting(project.status === 'waiting');
    setWaitingOn(project.waitingOn ?? '');
    setWaitingSince(project.waitingSince ?? localDateString());
  }, [project]);

  const selectValue: AssignableProjectStatus =
    draftWaiting && project.status !== 'waiting'
      ? 'waiting'
      : project.status === 'proposed'
        ? 'active'
        : project.status;

  const handleStatus = (next: string) => {
    if (
      next !== 'active' &&
      next !== 'waiting' &&
      next !== 'someday' &&
      next !== 'done'
    ) {
      return;
    }
    if (next === 'waiting') {
      setDraftWaiting(true);
      if (!waitingSince) {
        setWaitingSince(localDateString());
      }
      return;
    }
    setDraftWaiting(false);
    if (next === 'done' && openTaskCount > 0) {
      setDoneOpen(true);
      return;
    }
    onChangeStatus({ status: next });
  };

  const applyWaiting = () => {
    const trimmed = waitingOn.trim();
    if (!trimmed) {
      return;
    }
    onChangeStatus({
      status: 'waiting',
      waitingOn: trimmed,
      waitingSince: waitingSince === '' ? null : waitingSince,
    });
  };

  const showWaitingFields = draftWaiting || project.status === 'waiting';
  const waitingParts =
    project.status === 'waiting' && project.waitingOn
      ? waitingLineParts({
          waitingOn: project.waitingOn,
          waitingSince: project.waitingSince,
          today: localDateString(),
        })
      : null;
  const waitingDayLabel =
    waitingParts?.kind === 'known'
      ? waitingParts.days === 1
        ? '1 day'
        : `${waitingParts.days} days`
      : null;

  return (
    <div className="space-y-3" data-project-status-control="">
      <div className="flex items-center gap-2" data-project-status-row="">
        <span
          data-project-status={project.status}
          data-part="status-chip"
          className={
            project.status === 'waiting'
              ? 'inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground'
              : 'inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold'
          }
        >
          {statusLabel(project.status)}
        </span>
        <Select value={selectValue} onValueChange={handleStatus} disabled={isPending}>
          <SelectTrigger
            size="sm"
            data-project-status-trigger=""
            aria-label="Change project status"
            className="min-w-[7.5rem]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                data-project-status-option={option.value}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {waitingParts ? (
        <p
          data-project-waiting-summary=""
          data-part="waiting-line"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Clock className="size-4 shrink-0" aria-hidden="true" />
          <span>
            Waiting on <b>{waitingParts.who}</b>
            {waitingParts.kind === 'unknown'
              ? ' · since unknown'
              : ` since ${waitingParts.dateLabel} (${waitingDayLabel})`}
          </span>
        </p>
      ) : null}

      {showWaitingFields ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]" data-project-waiting-fields="">
          <div className="space-y-1">
            <Label htmlFor="project-waiting-on">Waiting on</Label>
            <Input
              id="project-waiting-on"
              data-project-waiting-on=""
              value={waitingOn}
              onChange={(event) => setWaitingOn(event.target.value)}
              maxLength={200}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="project-waiting-since">Since</Label>
            <Input
              id="project-waiting-since"
              data-project-waiting-since=""
              type="date"
              value={waitingSince}
              onChange={(event) => setWaitingSince(event.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              data-project-waiting-save=""
              onClick={applyWaiting}
              disabled={isPending || waitingOn.trim() === ''}
            >
              Set waiting
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" data-project-status-error="" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Dialog open={doneOpen} onOpenChange={setDoneOpen}>
        <DialogContent data-project-done-confirm="" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              This project has {openTaskCount} open task{openTaskCount === 1 ? '' : 's'}
            </DialogTitle>
            <DialogDescription>
              Complete them, take them out of the project, or cancel.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              data-project-done-cancel=""
              onClick={() => setDoneOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              data-project-done-remove=""
              onClick={() => {
                setDoneOpen(false);
                onChangeStatus({ status: 'done', openTasks: 'remove' });
              }}
            >
              Take them out of the project
            </Button>
            <Button
              type="button"
              data-project-done-complete=""
              onClick={() => {
                setDoneOpen(false);
                onChangeStatus({ status: 'done', openTasks: 'complete' });
              }}
            >
              Complete them
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
