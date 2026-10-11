import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
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
  SelectValue,
} from '@yoink/ui-base/components/select';
import type { Task } from '@yoink/api-contracts';
import { useDesktopLayout } from '@/lib/use-desktop-layout';

const UNLISTED_VALUE = 'unlisted';
const UNASSIGNED_VALUE = 'unassigned';

export type NewNextActionTask = {
  title: string;
  dueDate?: string;
  assigneeId?: string;
  listId?: string;
};

type NextActionPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  testId: string;
  openTasks: Task[];
  excludeTaskId?: string | null;
  lists: Array<{ id: string; name: string }>;
  members: Array<{ userId: string; label: string }>;
  isPending: boolean;
  error: string | null;
  onPickTask: (taskId: string) => void;
  onCreateTask: (input: NewNextActionTask) => void;
  extraActions?: ReactNode;
  whatsNext?: boolean;
};

export function NextActionPicker({
  open,
  onOpenChange,
  title,
  description,
  testId,
  openTasks,
  excludeTaskId,
  lists,
  members,
  isPending,
  error,
  onPickTask,
  onCreateTask,
  extraActions,
  whatsNext = false,
}: NextActionPickerProps) {
  const isDesktop = useDesktopLayout();
  const [newTitle, setNewTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [listId, setListId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }
    setNewTitle('');
    setDueDate('');
    setListId('');
    setAssigneeId('');
  }, [open]);

  const candidates = openTasks.filter((task) => task.id !== excludeTaskId);

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed || isPending) {
      return;
    }
    onCreateTask({
      title: trimmed,
      ...(dueDate ? { dueDate } : {}),
      ...(listId ? { listId } : {}),
      ...(assigneeId ? { assigneeId } : {}),
    });
  };

  const body = (
    <div className="space-y-5">
      {candidates.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Open tasks</p>
          <ul className="space-y-1">
            {candidates.map((task) => (
              <li key={task.id}>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-start whitespace-normal py-2 text-left"
                  data-next-action-pick-task={task.id}
                  disabled={isPending}
                  onClick={() => onPickTask(task.id)}
                >
                  {task.title}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No other open tasks in this project.</p>
      )}

      <form onSubmit={handleCreate} className="space-y-3" data-next-action-new-task="">
        <p className="text-sm font-medium">New task</p>
        <div className="space-y-1">
          <Label htmlFor="next-action-new-title">Title</Label>
          <Input
            id="next-action-new-title"
            data-next-action-new-title=""
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            maxLength={500}
            disabled={isPending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="next-action-new-due">Due</Label>
          <Input
            id="next-action-new-due"
            data-next-action-new-due=""
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="next-action-new-list">List</Label>
          <Select
            value={listId || UNLISTED_VALUE}
            onValueChange={(value) => setListId(value === UNLISTED_VALUE ? '' : value)}
            disabled={isPending}
          >
            <SelectTrigger id="next-action-new-list" className="w-full">
              <SelectValue placeholder="Unlisted" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNLISTED_VALUE}>Unlisted</SelectItem>
              {lists.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {members.length > 0 ? (
          <div className="space-y-1">
            <Label htmlFor="next-action-new-assignee">Assignee</Label>
            <Select
              value={assigneeId || UNASSIGNED_VALUE}
              onValueChange={(value) =>
                setAssigneeId(value === UNASSIGNED_VALUE ? '' : value)
              }
              disabled={isPending}
            >
              <SelectTrigger id="next-action-new-assignee" className="w-full">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                {members.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {error ? (
          <p role="alert" data-next-action-error="" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          data-next-action-create=""
          disabled={isPending || newTitle.trim() === ''}
        >
          {isPending ? 'Saving…' : 'Create and set'}
        </Button>
      </form>
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          data-next-action-picker=""
          data-whats-next-prompt={whatsNext ? '' : undefined}
          data-testid={testId}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {body}
          {extraActions ? <DialogFooter>{extraActions}</DialogFooter> : null}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        data-next-action-picker=""
        data-whats-next-prompt={whatsNext ? '' : undefined}
        data-testid={testId}
      >
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-4">{body}</div>
        {extraActions ? <DrawerFooter>{extraActions}</DrawerFooter> : null}
      </DrawerContent>
    </Drawer>
  );
}
