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
import { Pencil, MessageSquare, X } from 'lucide-react';
import type { Task, Capture } from '@yoink/api-contracts';

type TaskEditModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  sourceCapture: Capture | null;
  onSave: (taskId: string, updates: { title?: string; dueDate?: string | null }) => void;
  isLoading?: boolean;
  isFetchingCapture?: boolean;
};

export function TaskEditModal({
  open,
  onOpenChange,
  task,
  sourceCapture,
  onSave,
  isLoading = false,
  isFetchingCapture = false,
}: TaskEditModalProps) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDueDate(task.dueDate ?? '');
    }
  }, [task]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !title.trim()) return;

    const updates: { title?: string; dueDate?: string | null } = {};

    // Only include changed fields
    if (title.trim() !== task.title) {
      updates.title = title.trim();
    }

    const newDueDate = dueDate || null;
    const oldDueDate = task.dueDate ?? null;
    if (newDueDate !== oldDueDate) {
      updates.dueDate = newDueDate;
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
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {sourceCapture.content}
                    </p>
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
