import { useState, type FormEvent } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Button } from '@yoink/ui-base/components/button';
import { Input } from '@yoink/ui-base/components/input';
import { Label } from '@yoink/ui-base/components/label';
import { Card, CardContent } from '@yoink/ui-base/components/card';
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
import { List, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/header';
import { ErrorState } from '@/components/error-state';
import { DeleteNamedListDialog } from '@/components/delete-named-list-dialog';

export const Route = createFileRoute('/_authenticated/lists')({
  component: ListsPage,
});

function ListsPage() {
  const queryClient = tsrLists.useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingList, setDeletingList] = useState<{ id: string; name: string } | null>(
    null
  );

  const { data, isPending, error, refetch } = tsrLists.list.useQuery({
    queryKey: ['lists'],
    queryData: {},
  });

  const createMutation = tsrLists.create.useMutation({
    onSuccess: () => {
      toast.success('List created');
      setDialogOpen(false);
      setName('');
      setFormError(null);
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
        setFormError(body?.message ?? 'A list with this name already exists');
        return;
      }
      toast.error('Failed to create list');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['lists'] });
    },
  });

  const lists = data?.status === 200 ? data.body.lists : [];
  const trimmedName = name.trim();

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setName('');
      setFormError(null);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmedName || createMutation.isPending) return;
    createMutation.mutate({ body: { name: trimmedName } });
  };

  return (
    <div className="container mx-auto max-w-2xl p-4">
      <Header viewName="Lists" />

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <p className="text-center text-muted-foreground">Loading...</p>
      ) : (
        <>
          <div className="mb-4">
            <Button type="button" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              New list
            </Button>
          </div>

          <Card data-unlisted-pile className="mb-3">
            <CardContent className="flex items-center justify-between gap-3 py-4">
              <Link to="/lists/unlisted" className="font-medium hover:underline">
                Unlisted
              </Link>
            </CardContent>
          </Card>

          {lists.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <List className="mx-auto mb-2 h-8 w-8" />
                <p>No named lists yet</p>
                <p className="text-sm">This organization has no named lists.</p>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-3">
              {lists.map((list) => (
                <li key={list.id}>
                  <Card data-list-id={list.id} data-list-name={list.name}>
                    <CardContent className="flex items-center justify-between gap-3 py-4">
                      <Link
                        to="/lists/$listId"
                        params={{ listId: list.id }}
                        className="font-medium hover:underline"
                      >
                        {list.name}
                      </Link>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${list.name}`}
                        onClick={() => {
                          setDeletingList({ id: list.id, name: list.name });
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
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
                onClick={() => handleDialogOpenChange(false)}
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

      <DeleteNamedListDialog
        list={deletingList}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingList(null);
          }
        }}
      />
    </div>
  );
}
