import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@yoink/ui-base/components/button';
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

type NamedListRef = {
  id: string;
  name: string;
};

type DeleteNamedListDialogProps = {
  list: NamedListRef | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
};

export function DeleteNamedListDialog({
  list,
  onOpenChange,
  onDeleted,
}: DeleteNamedListDialogProps) {
  const queryClient = useQueryClient();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (input: Parameters<typeof listClient.delete>[0]) => listClient.delete(input),
    onMutate: async () => {
      await cancelLiveQueries(queryClient);
    },
    onSuccess: async () => {
      toast.success('List deleted');
      setDeleteError(null);
      onDeleted?.();
      onOpenChange(false);
      await invalidateLiveQueries(queryClient);
    },
    onError: (err) => {
      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      if (httpStatusOf(err) === 409) {
        setDeleteError(httpFailureMessage(err) ?? 'This list still has open tasks');
        return;
      }
      toast.error('Failed to delete list');
    },
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setDeleteError(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={list !== null} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete list?</DialogTitle>
          <DialogDescription>
            {list
              ? `Delete ${list.name}? You can only delete a list that has no open tasks.`
              : 'You can only delete a list that has no open tasks.'}
          </DialogDescription>
        </DialogHeader>
        {deleteError ? (
          <p role="alert" data-list-delete-error className="text-sm text-destructive">
            {deleteError}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteMutation.isPending || !list}
            onClick={() => {
              if (!list || deleteMutation.isPending) return;
              setDeleteError(null);
              deleteMutation.mutate({ id: list.id });
            }}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
