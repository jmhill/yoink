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
import { CheckSquare } from 'lucide-react';

type TaskCreationModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capture: { id: string; content: string } | null;
  onConfirm: (captureId: string, title: string, dueDate?: string) => void;
  isLoading?: boolean;
};

export function TaskCreationModal({
  open,
  onOpenChange,
  capture,
  onConfirm,
  isLoading = false,
}: TaskCreationModalProps) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Reset form when capture changes (new capture selected for processing)
  useEffect(() => {
    if (capture) {
      setTitle(capture.content.slice(0, 100).trim());
      setDueDate('');
    }
  }, [capture]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!capture || !title.trim()) return;
    onConfirm(capture.id, title.trim(), dueDate || undefined);
  };

  // Get today's date in YYYY-MM-DD format for min date
  const today = new Date().toISOString().split('T')[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Create Task
          </DialogTitle>
          <DialogDescription>
            Convert this capture into a task. You can edit the title and set an optional due date.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              disabled={isLoading}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-due-date">Due Date (optional)</Label>
            <Input
              id="task-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              min={today}
              disabled={isLoading}
            />
          </div>

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
              {isLoading ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
