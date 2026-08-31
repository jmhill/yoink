import { useState, useEffect } from 'react';
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
import { Card, CardContent } from '@yoink/ui-base/components/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@yoink/ui-base/components/select';
import { Pencil, MessageSquare, X } from 'lucide-react';
import type { Task, Capture } from '@yoink/api-contracts';

/** Radix Select forbids an empty item value; map to/from the unassigned state. */
const UNASSIGNED_VALUE = 'unassigned';

type TaskEditModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  sourceCapture: Capture | null;
  onSave: (taskId: string, updates: { title?: string; dueDate?: string | null; assigneeId?: string | null; listId?: string }) => void;
  isLoading?: boolean;
  isFetchingCapture?: boolean;
  members?: Array<{ userId: string; label: string }>;
  lists?: Array<{ id: string; name: string }>;
};

export function TaskEditModal({
  open,
  onOpenChange,
  task,
  sourceCapture,
  onSave,
  isLoading = false,
  isFetchingCapture = false,
  members = [],
  lists = [],
}: TaskEditModalProps) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [listId, setListId] = useState('');

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDueDate(task.dueDate ?? '');
      setAssigneeId(task.assigneeId ?? '');
      setListId(task.listId ?? '');
    }
  }, [task]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !title.trim()) return;

    const updates: { title?: string; dueDate?: string | null; assigneeId?: string | null; listId?: string } = {};

    // Only include changed fields
    if (title.trim() !== task.title) {
      updates.title = title.trim();
    }

    const newDueDate = dueDate || null;
    const oldDueDate = task.dueDate ?? null;
    if (newDueDate !== oldDueDate) {
      updates.dueDate = newDueDate;
    }

    const newAssigneeId = assigneeId || null;
    const oldAssigneeId = task.assigneeId ?? null;
    if (newAssigneeId !== oldAssigneeId) {
      updates.assigneeId = newAssigneeId;
    }

    if (listId && listId !== (task.listId ?? '')) {
      updates.listId = listId;
    }

    // Only save if something changed
    if (Object.keys(updates).length > 0) {
      onSave(task.id, updates);
    } else {
      onOpenChange(false);
    }
  };

  const handleClearDueDate = () => {
    setDueDate('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edit Task
          </DialogTitle>
          <DialogDescription>
            Update the task title and due date.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-task-title">Title</Label>
            <Input
              id="edit-task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              disabled={isLoading}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-task-due-date">Due Date</Label>
            <div className="flex gap-2">
              <Input
                id="edit-task-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={isLoading}
                className="flex-1"
              />
              {dueDate && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleClearDueDate}
                  disabled={isLoading}
                  title="Clear due date"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-task-assignee">Assignee</Label>
            <Select
              value={assigneeId || UNASSIGNED_VALUE}
              onValueChange={(value) =>
                setAssigneeId(value === UNASSIGNED_VALUE ? '' : value)
              }
              disabled={isLoading}
            >
              <SelectTrigger id="edit-task-assignee" className="w-full">
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

          <div className="space-y-2">
            <Label htmlFor="edit-task-list">List</Label>
            <Select
              value={listId || undefined}
              onValueChange={setListId}
              disabled={isLoading}
            >
              <SelectTrigger id="edit-task-list" className="w-full">
                <SelectValue placeholder="No list" />
              </SelectTrigger>
              <SelectContent>
                {lists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Source capture section */}
          {task?.captureId && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Original Capture
              </Label>
              <Card className="bg-muted/50">
                <CardContent className="py-3">
                  {isFetchingCapture ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : sourceCapture ? (
                    <div className="space-y-2">
                      {sourceCapture.sourceUrl && (
                        <a
                          href={sourceCapture.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary underline break-all"
                        >
                          {sourceCapture.sourceUrl}
                        </a>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {sourceCapture.content}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      Original capture not available
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !title.trim()}>
              {isLoading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
