import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { httpFailureMessage, httpStatusOf, isNetworkFailure, listClient } from '@/api/client';
import { cancelLiveQueries, invalidateLiveQueries } from '@/lib/live-query';
import { toast } from 'sonner';

type CreateNamedListDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (list: { id: string; name: string }) => void;
};

export function CreateNamedListDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateNamedListDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const trimmedName = name.trim();

  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof listClient.create>[0]) => listClient.create(input),
    onMutate: async () => {
      await cancelLiveQueries(queryClient);
    },
    onSuccess: async (result) => {
      toast.success('List created');
      setName('');
      setFormError(null);
      onOpenChange(false);
      await invalidateLiveQueries(queryClient);
      onCreated({ id: result.id, name: result.name });
    },
    onError: (err) => {
      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      if (httpStatusOf(err) === 409) {
        setFormError(httpFailureMessage(err) ?? 'A list with this name already exists');
        return;
      }
      toast.error('Failed to create list');
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setName('');
      setFormError(null);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmedName || createMutation.isPending) return;
    createMutation.mutate({ name: trimmedName });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New list</DialogTitle>
          <DialogDescription>
            Give this list a name. You can put tasks on it later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="list-name">Name</Label>
            <Input
              id="list-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFormError(null);
              }}
              placeholder="Groceries"
              maxLength={200}
              disabled={createMutation.isPending}
              autoFocus
            />
            {formError ? (
              <p role="alert" data-list-create-error className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !trimmedName}
            >
              {createMutation.isPending ? 'Creating...' : 'Create list'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
