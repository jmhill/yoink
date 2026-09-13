import { useState } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@yoink/ui-base/components/dialog';
import { tsrLists } from '@/api/client';
import { isFetchError } from '@ts-rest/react-query/v5';
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
  const queryClient = tsrLists.useQueryClient();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteMutation = tsrLists.delete.useMutation({
    onSuccess: async (result) => {
      if (result.status !== 204) return;
      toast.success('List deleted');
      setDeleteError(null);
      onDeleted?.();
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['lists'] });
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      if (
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        err.status === 409 &&
        'body' in err
      ) {
        const body = err.body as { message?: string };
        setDeleteError(body?.message ?? 'This list still has open tasks');
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
              deleteMutation.mutate({ params: { id: list.id } });
            }}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
