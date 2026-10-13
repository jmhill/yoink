import { useEffect, useState } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { Checkbox } from '@yoink/ui-base/components/checkbox';
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
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@yoink/ui-base/components/drawer';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@yoink/ui-base/components/select';
import { cn } from '@yoink/ui-base/lib/utils';
import type { AssignableProjectStatus, Project } from '@yoink/api-contracts';
import { localDateString } from '@/lib/format-waiting-line';
import { useDesktopLayout } from '@/lib/use-desktop-layout';

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
  waitingFormOpen: boolean;
  onWaitingFormOpenChange: (open: boolean) => void;
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
  waitingFormOpen,
  onWaitingFormOpenChange,
  onChangeStatus,
}: ProjectStatusControlProps) {
  const isDesktop = useDesktopLayout();
  const [waitingOn, setWaitingOn] = useState(project.waitingOn ?? '');
  const [waitingSince, setWaitingSince] = useState(
    project.waitingSince ?? localDateString()
  );
  const [dontKnow, setDontKnow] = useState(project.status === 'waiting' && !project.waitingSince);
  const [sinceError, setSinceError] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);

  useEffect(() => {
    setWaitingOn(project.waitingOn ?? '');
    setWaitingSince(project.waitingSince ?? localDateString());
    setDontKnow(project.status === 'waiting' && !project.waitingSince);
    setSinceError(null);
  }, [project, waitingFormOpen]);

  const selectValue: AssignableProjectStatus =
    project.status === 'proposed' || project.status === 'declined' ? 'active' : project.status;

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
      onWaitingFormOpenChange(true);
      return;
    }
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
    if (!dontKnow && waitingSince === '') {
      setSinceError('Choose a date, or check Don’t know');
      return;
    }
    onChangeStatus({
      status: 'waiting',
      waitingOn: trimmed,
      waitingSince: dontKnow ? null : waitingSince,
    });
    onWaitingFormOpenChange(false);
  };

  const waitingForm = (
    <div className="grid gap-3" data-project-waiting-fields="">
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
          onChange={(event) => {
            setWaitingSince(event.target.value);
            setSinceError(null);
          }}
          disabled={isPending || dontKnow}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          data-project-waiting-unknown=""
          checked={dontKnow}
          onCheckedChange={(checked) => {
            setDontKnow(checked === true);
            setSinceError(null);
            if (checked === true) {
              setWaitingSince(localDateString());
            }
          }}
          disabled={isPending}
        />
        Don’t know
      </label>
      {sinceError ? (
        <p role="alert" className="text-sm text-destructive">
          {sinceError}
        </p>
      ) : null}
    </div>
  );

  const waitingActions = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => onWaitingFormOpenChange(false)}
        disabled={isPending}
      >
        Cancel
      </Button>
      <Button
        type="button"
        data-project-waiting-save=""
        onClick={applyWaiting}
        disabled={isPending || waitingOn.trim() === ''}
      >
        Set waiting
      </Button>
    </>
  );

  return (
    <div className="space-y-3" data-project-status-control="">
      <div className="flex items-center gap-2" data-project-status-row="">
        <Select value={selectValue} onValueChange={handleStatus} disabled={isPending}>
          <SelectTrigger
            size="sm"
            data-project-status-trigger=""
            aria-label="Change project status"
            className={cn(
              'h-auto min-w-0 rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-none',
              project.status === 'waiting'
                ? 'border-warning-border bg-warning-muted text-warning'
                : 'border-border bg-muted text-foreground'
            )}
          >
            <span
              data-project-status={project.status}
              data-part="status-chip"
              className={cn(
                'inline-flex items-center gap-1.5',
                project.status === 'waiting' && 'text-warning'
              )}
            >
              {project.status === 'active' ? (
                <span data-status-dot="active" className="size-1.5 rounded-full bg-success" />
              ) : null}
              {project.status === 'waiting' ? (
                <span data-status-dot="waiting" className="size-1.5 rounded-full bg-warning" />
              ) : null}
              {statusLabel(project.status)}
            </span>
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

      {error ? (
        <p role="alert" data-project-status-error="" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {isDesktop ? (
        <Dialog open={waitingFormOpen} onOpenChange={onWaitingFormOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Waiting</DialogTitle>
              <DialogDescription>Who are you waiting on, and since when?</DialogDescription>
            </DialogHeader>
            {waitingForm}
            <DialogFooter>{waitingActions}</DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer open={waitingFormOpen} onOpenChange={onWaitingFormOpenChange}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Waiting</DrawerTitle>
              <DrawerDescription>Who are you waiting on, and since when?</DrawerDescription>
            </DrawerHeader>
            <div className="px-4">{waitingForm}</div>
            <DrawerFooter>{waitingActions}</DrawerFooter>
          </DrawerContent>
        </Drawer>
      )}

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
