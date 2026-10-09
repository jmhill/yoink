import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { Card, CardContent } from '@yoink/ui-base/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@yoink/ui-base/components/dialog';
import { tsr } from '@/api/client';
import { cancelLiveQueries, invalidateLiveQueries, isBlockingQueryFailure } from '@/lib/live-query';
import {
  LoadMoreButton,
  emptyHistoryPages,
  mapHistoryPageItems,
  useHistoryPages,
} from '@/lib/use-history-pages';
import type { Capture } from '@yoink/api-contracts';
import { isFetchError } from '@ts-rest/react-query/v5';
import { Trash2, Inbox, RotateCcw, X } from 'lucide-react';
import { ErrorState } from '@/components/error-state';
import { CaptureSnippet, CAPTURE_ACTION_CLASS, CAPTURE_SNIPPET_CARD_CLASS } from '@/components/capture-snippet';
import { InboxPaneShell } from '@/components/inbox-pane-shell';
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

  const {
    data,
    items: captures,
    isPending,
    error,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useHistoryPages<'captures', Capture>({
    queryKey: ['captures', 'trashed'],
    path: '/api/captures',
    itemKey: 'captures',
    search: { status: 'trashed' },
    enabled: true,
  });

  const restoreMutation = tsr.restore.useMutation({
    onMutate: async ({ params }) => {
      // Cancel in-flight queries to prevent overwrites
      await cancelLiveQueries(tsrQueryClient);

      // Snapshot current state for rollback
      const previousTrashed = tsrQueryClient.getQueryData(['captures', 'trashed']);
      const previousInbox = tsrQueryClient.list.getQueryData([
        'captures',
        'inbox',
      ]);

      const captureToRestore = captures.find((c) => c.id === params.id);

      tsrQueryClient.setQueryData(
        ['captures', 'trashed'],
        mapHistoryPageItems<'captures', Capture>(previousTrashed, 'captures', (items) =>
          items.filter((c) => c.id !== params.id)
        )
      );

      if (captureToRestore && previousInbox?.status === 200) {
        tsrQueryClient.list.setQueryData(['captures', 'inbox'], {
          ...previousInbox,
          body: {
            ...previousInbox.body,
            captures: [
              { ...captureToRestore, status: 'inbox' as const },
              ...previousInbox.body.captures,
            ],
            total: previousInbox.body.total + 1,
          },
        });
      }

      return { previousTrashed, previousInbox };
    },

    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousTrashed) {
        tsrQueryClient.setQueryData(['captures', 'trashed'], context.previousTrashed);
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
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  const deleteMutation = tsr.delete.useMutation({
    onMutate: async ({ params }) => {
      await cancelLiveQueries(tsrQueryClient);

      const previousTrashed = tsrQueryClient.getQueryData(['captures', 'trashed']);

      tsrQueryClient.setQueryData(
        ['captures', 'trashed'],
        mapHistoryPageItems<'captures', Capture>(previousTrashed, 'captures', (items) =>
          items.filter((c) => c.id !== params.id)
        )
      );

      return { previousTrashed };
    },

    onError: (err, _variables, context) => {
      if (context?.previousTrashed) {
        tsrQueryClient.setQueryData(['captures', 'trashed'], context.previousTrashed);
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
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  const emptyTrashMutation = tsr.emptyTrash.useMutation({
    onMutate: async () => {
      await cancelLiveQueries(tsrQueryClient);

      const previousTrashed = tsrQueryClient.getQueryData(['captures', 'trashed']);

      tsrQueryClient.setQueryData(
        ['captures', 'trashed'],
        emptyHistoryPages('captures')
      );

      return { previousTrashed };
    },

    onError: (err, _variables, context) => {
      if (context?.previousTrashed) {
        tsrQueryClient.setQueryData(['captures', 'trashed'], context.previousTrashed);
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
      void invalidateLiveQueries(tsrQueryClient);
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

  return (
    <InboxPaneShell active="trash">
      {isBlockingQueryFailure(error, data) && error ? (
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
                  className={CAPTURE_SNIPPET_CARD_CLASS}
                  leftAction={{
                    icon: <Inbox className="h-5 w-5" />,
                    label: 'Restore',
                    type: 'restore',
                    onAction: (direction) => handleRestore(capture.id, direction === 'left' ? 'left' : 'right'),
                  }}
                  disabled={restoreMutation.isPending || deleteMutation.isPending}
                >
                  <CaptureSnippet
                    content={capture.content}
                    sourceUrl={capture.sourceUrl}
                    sourceApp={capture.sourceApp}
                    capturedAt={capture.capturedAt}
                    actions={
                      <>
                        <Button
                          variant="ghost"
                          className={CAPTURE_ACTION_CLASS}
                          onClick={() => handleRestore(capture.id, 'left')}
                          disabled={restoreMutation.isPending || deleteMutation.isPending}
                          title="Restore"
                          aria-label="Restore"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Restore
                        </Button>
                        <Button
                          variant="ghost"
                          className={`${CAPTURE_ACTION_CLASS} text-destructive hover:text-destructive hover:bg-accent`}
                          onClick={() => setDeleteConfirmId(capture.id)}
                          disabled={restoreMutation.isPending || deleteMutation.isPending}
                          title="Delete permanently"
                          aria-label="Delete permanently"
                        >
                          <X className="h-4 w-4" />
                          Delete
                        </Button>
                      </>
                    }
                  />
                </SwipeableCard>
              </AnimatedListItem>
            ))}
          </AnimatedList>
          <LoadMoreButton
            hasNextPage={Boolean(hasNextPage)}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => void fetchNextPage()}
          />
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
    </InboxPaneShell>
  );
}
