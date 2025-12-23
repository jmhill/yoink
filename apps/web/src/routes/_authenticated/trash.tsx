import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { Card, CardContent } from '@yoink/ui-base/components/card';
import { Tabs, TabsList, TabsTrigger } from '@yoink/ui-base/components/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@yoink/ui-base/components/dialog';
import { tsr } from '@/api/client';
import { isFetchError } from '@ts-rest/react-query/v5';
import { Trash2, Inbox, RotateCcw, Link as LinkIcon, Clock, X } from 'lucide-react';
import { Header } from '@/components/header';
import { ErrorState } from '@/components/error-state';
import { SwipeableCard } from '@/components/swipeable-card';
import { AnimatedList, AnimatedListItem, type ExitDirection } from '@/components/animated-list';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/trash')({
  component: TrashPage,
});

function TrashPage() {
  const [exitDirections, setExitDirections] = useState<Record<string, ExitDirection>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [emptyTrashConfirmOpen, setEmptyTrashConfirmOpen] = useState(false);
  const tsrQueryClient = tsr.useQueryClient();

  const { data, isPending, error, refetch } = tsr.list.useQuery({
    queryKey: ['captures', 'trashed'],
    queryData: { query: { status: 'trashed' as const } },
  });

  const restoreMutation = tsr.restore.useMutation({
    onMutate: async ({ params }) => {
      // Cancel in-flight queries to prevent overwrites
      await tsrQueryClient.cancelQueries({ queryKey: ['captures'] });

      // Snapshot current state for rollback
      const previousTrashed = tsrQueryClient.list.getQueryData([
        'captures',
        'trashed',
      ]);
      const previousInbox = tsrQueryClient.list.getQueryData([
        'captures',
        'inbox',
      ]);

      // Find the capture being restored
      if (previousTrashed?.status === 200) {
        const captureToRestore = previousTrashed.body.captures.find(
          (c) => c.id === params.id
        );

        // Remove from trashed
        tsrQueryClient.list.setQueryData(['captures', 'trashed'], {
          ...previousTrashed,
          body: {
            ...previousTrashed.body,
            captures: previousTrashed.body.captures.filter(
              (c) => c.id !== params.id
            ),
          },
        });

        // Add to inbox (if cache exists)
        if (captureToRestore && previousInbox?.status === 200) {
          tsrQueryClient.list.setQueryData(['captures', 'inbox'], {
            ...previousInbox,
            body: {
              ...previousInbox.body,
              captures: [
                { ...captureToRestore, status: 'inbox' as const },
                ...previousInbox.body.captures,
              ],
            },
          });
        }
      }

      return { previousTrashed, previousInbox };
    },

    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousTrashed) {
        tsrQueryClient.list.setQueryData(
          ['captures', 'trashed'],
          context.previousTrashed
        );
      }
      if (context?.previousInbox) {
        tsrQueryClient.list.setQueryData(
          ['captures', 'inbox'],
          context.previousInbox
        );
      }

      // Show error toast
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to restore');
      }
    },

    onSuccess: () => {
      toast.success('Restored to inbox');
    },

    onSettled: () => {
      // Refetch to ensure consistency with server
      tsrQueryClient.invalidateQueries({ queryKey: ['captures'] });
    },
  });

  const deleteMutation = tsr.delete.useMutation({
    onMutate: async ({ params }) => {
      await tsrQueryClient.cancelQueries({ queryKey: ['captures'] });

      const previousTrashed = tsrQueryClient.list.getQueryData([
        'captures',
        'trashed',
      ]);

      if (previousTrashed?.status === 200) {
        tsrQueryClient.list.setQueryData(['captures', 'trashed'], {
          ...previousTrashed,
          body: {
            ...previousTrashed.body,
            captures: previousTrashed.body.captures.filter(
              (c) => c.id !== params.id
            ),
          },
        });
      }

      return { previousTrashed };
    },

    onError: (err, _variables, context) => {
      if (context?.previousTrashed) {
        tsrQueryClient.list.setQueryData(
          ['captures', 'trashed'],
          context.previousTrashed
        );
      }

      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to delete');
      }
    },

    onSuccess: () => {
      toast.success('Permanently deleted');
    },

    onSettled: () => {
      tsrQueryClient.invalidateQueries({ queryKey: ['captures'] });
    },
  });

  const emptyTrashMutation = tsr.emptyTrash.useMutation({
    onMutate: async () => {
      await tsrQueryClient.cancelQueries({ queryKey: ['captures'] });

      const previousTrashed = tsrQueryClient.list.getQueryData([
        'captures',
        'trashed',
      ]);

      tsrQueryClient.list.setQueryData(['captures', 'trashed'], {
        status: 200 as const,
        body: { captures: [] },
        headers: new Headers(),
      });

      return { previousTrashed };
    },

    onError: (err, _variables, context) => {
      if (context?.previousTrashed) {
        tsrQueryClient.list.setQueryData(
          ['captures', 'trashed'],
          context.previousTrashed
        );
      }

      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to empty trash');
      }
    },

    onSuccess: (response) => {
      if (response.status === 200) {
        const count = response.body.deletedCount;
        toast.success(`Deleted ${count} ${count === 1 ? 'item' : 'items'}`);
      }
    },

    onSettled: () => {
      tsrQueryClient.invalidateQueries({ queryKey: ['captures'] });
    },
  });

  const handleRestore = (id: string, direction: ExitDirection = 'left') => {
    setExitDirections((prev) => ({ ...prev, [id]: direction }));
    restoreMutation.mutate({
      params: { id },
      body: {},
    });
  };

  const handleDelete = (id: string) => {
    setExitDirections((prev) => ({ ...prev, [id]: 'right' }));
    deleteMutation.mutate({
      params: { id },
    });
    setDeleteConfirmId(null);
  };

  const handleEmptyTrash = () => {
    emptyTrashMutation.mutate({ body: {} });
    setEmptyTrashConfirmOpen(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const captures = data?.status === 200 ? data.body.captures : [];

  return (
    <div className="container mx-auto max-w-2xl p-4">
      <Header />

      <Tabs defaultValue="trash" className="mb-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="snoozed" asChild>
            <Link to="/snoozed" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Snoozed
            </Link>
          </TabsTrigger>
          <TabsTrigger value="inbox" asChild>
            <Link to="/" className="flex items-center gap-2">
              <Inbox className="h-4 w-4" />
              Inbox
            </Link>
          </TabsTrigger>
          <TabsTrigger value="trash" asChild>
            <Link to="/trash" className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              Trash
            </Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <p className="text-center text-muted-foreground">Loading...</p>
      ) : captures.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Trash2 className="mx-auto mb-2 h-8 w-8" />
            <p>No trashed captures</p>
            <p className="text-sm">Trashed items will appear here</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex justify-end">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setEmptyTrashConfirmOpen(true)}
              disabled={emptyTrashMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Empty Trash
            </Button>
          </div>
          <AnimatedList>
            {captures.map((capture) => (
              <AnimatedListItem
                key={capture.id}
                id={capture.id}
                exitDirection={exitDirections[capture.id] ?? 'left'}
              >
                <SwipeableCard
                  data-capture-id={capture.id}
                  leftAction={{
                    icon: <Inbox className="h-5 w-5" />,
                    label: 'Restore',
                    type: 'restore',
                    onAction: (direction) => handleRestore(capture.id, direction === 'left' ? 'left' : 'right'),
                  }}
                  disabled={restoreMutation.isPending || deleteMutation.isPending}
                >
                  <CardContent className="flex items-start justify-between gap-2 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="whitespace-pre-wrap break-words">{capture.content}</p>
                      {capture.sourceUrl && (
                        <a
                          href={capture.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 hover:underline"
                          data-testid="source-url"
                        >
                          <LinkIcon className="h-3 w-3" />
                          <span className="truncate">{capture.sourceUrl}</span>
                        </a>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(capture.capturedAt)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRestore(capture.id, 'left')}
                        disabled={restoreMutation.isPending || deleteMutation.isPending}
                        title="Restore"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteConfirmId(capture.id)}
                        disabled={restoreMutation.isPending || deleteMutation.isPending}
                        title="Delete permanently"
                        className="text-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </SwipeableCard>
              </AnimatedListItem>
            ))}
          </AnimatedList>
        </>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete permanently?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This capture will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Empty trash confirmation dialog */}
      <Dialog open={emptyTrashConfirmOpen} onOpenChange={setEmptyTrashConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Empty trash?</DialogTitle>
            <DialogDescription>
              This will permanently delete {captures.length} {captures.length === 1 ? 'item' : 'items'}.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmptyTrashConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleEmptyTrash}>
              Empty Trash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
