import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { Input } from '@yoink/ui-base/components/input';
import { Label } from '@yoink/ui-base/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@yoink/ui-base/components/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@yoink/ui-base/components/sheet';
import { ArrowRight } from 'lucide-react';

const UNLISTED_VALUE = 'unlisted';

export type PromoteConfirmInput = {
  title: string;
  dueDate?: string;
  listId?: string;
};

type NamedListOption = {
  id: string;
  name: string;
};

type PromoteSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capture: { id: string; content: string } | null;
  lists: NamedListOption[];
  onConfirm: (captureId: string, input: PromoteConfirmInput) => void;
  isLoading?: boolean;
};

export function PromoteSheet({
  open,
  onOpenChange,
  capture,
  lists,
  onConfirm,
  isLoading = false,
}: PromoteSheetProps) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [listId, setListId] = useState('');

  // Reset when a new capture is selected. 100 char limit matches processing.
  useEffect(() => {
    if (capture) {
      setTitle(capture.content.slice(0, 100).trim());
      setDueDate('');
      setListId('');
    }
  }, [capture]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!capture || !title.trim()) return;
    onConfirm(capture.id, {
      title: title.trim(),
      dueDate: dueDate || undefined,
      listId: listId || undefined,
    });
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-promote-sheet="" side="right" className="gap-0">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5" />
            Promote
          </SheetTitle>
          <SheetDescription>
            Turn this capture into a task. Title is required; list is optional.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
          <div className="space-y-4 px-4">
            <div className="space-y-2">
              <Label htmlFor="promote-title">Title</Label>
              <Input
                id="promote-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
                disabled={isLoading}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="promote-list">List</Label>
              <Select
                value={listId || UNLISTED_VALUE}
                onValueChange={(value) =>
                  setListId(value === UNLISTED_VALUE ? '' : value)
                }
                disabled={isLoading}
              >
                <SelectTrigger id="promote-list" className="w-full">
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

            <div className="space-y-2">
              <Label htmlFor="promote-due-date">Due Date (optional)</Label>
              <Input
                id="promote-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                min={today}
                disabled={isLoading}
              />
            </div>
          </div>

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !title.trim()}>
              {isLoading ? 'Promoting...' : 'Promote'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
