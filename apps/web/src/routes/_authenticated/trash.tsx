import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { captureClient, isNetworkFailure } from '@/api/client';
import { cancelLiveQueries, invalidateLiveQueries, isBlockingQueryFailure } from '@/lib/live-query';
import {
  LoadMoreButton,
  emptyCaptureHistoryPages,
  isCaptureHistoryData,
  mapCaptureHistoryPageItems,
  useTrashedCapturePages,
} from '@/lib/use-history-pages';
import { Trash2, Inbox, RotateCcw, X } from 'lucide-react';
import { ErrorState } from '@/components/error-state';
import { CaptureSnippet, CAPTURE_ACTION_CLASS, CAPTURE_SNIPPET_CARD_CLASS } from '@/components/capture-snippet';
import { InboxPaneShell } from '@/components/inbox-pane-shell';
import { SwipeableCard } from '@/components/swipeable-card';
import { AnimatedList, AnimatedListItem, type ExitDirection } from '@/components/animated-list';
import { toast } from 'sonner';
import type { Capture } from '@yoink/api-contracts';

export const Route = createFileRoute('/_authenticated/trash')({
  component: TrashPage,
});

const isCapturePage = (
  value: unknown
): value is { captures: Capture[]; total: number } =>
  typeof value === 'object' &&
  value !== null &&
  'captures' in value &&
  Array.isArray(value.captures) &&
  'total' in value &&
  typeof value.total === 'number';

function TrashPage() {
  const [exitDirections, setExitDirections] = useState<Record<string, ExitDirection>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [emptyTrashConfirmOpen, setEmptyTrashConfirmOpen] = useState(false);
  const queryClient = useQueryClient();

  const {
    data,
    items: captures,
    isPending,
    error,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useTrashedCapturePages(true);

  const restoreMutation = useMutation({
    mutationFn: (input: { id: string }) => captureClient.restore(input),
    onMutate: async ({ id }) => {
      // Cancel in-flight queries to prevent overwrites
      await cancelLiveQueries(queryClient);

      // Snapshot current state for rollback
      const previousTrashed = queryClient.getQueryData(['captures', 'trashed']);
      const previousInbox = queryClient.getQueryData(['captures', 'inbox']);

      const captureToRestore = captures.find((capture) => capture.id === id);

      if (isCaptureHistoryData(previousTrashed)) {
        queryClient.setQueryData(
          ['captures', 'trashed'],
          mapCaptureHistoryPageItems(previousTrashed, (items) =>
            items.filter((capture) => capture.id !== id)
          )
        );
      }

      if (captureToRestore && isCapturePage(previousInbox)) {
        queryClient.setQueryData(['captures', 'inbox'], {
          ...previousInbox,
          captures: [
            { ...captureToRestore, status: 'inbox' },
            ...previousInbox.captures,
          ],
          total: previousInbox.total + 1,
        });
      }

      return { previousTrashed, previousInbox };
    },

    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousTrashed) {
        queryClient.setQueryData(['captures', 'trashed'], context.previousTrashed);
      }
      if (context?.previousInbox) {
        queryClient.setQueryData(['captures', 'inbox'], context.previousInbox);
      }

      // Show error toast
      if (isNetworkFailure(err)) {
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
      void invalidateLiveQueries(queryClient);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (input: { id: string }) => captureClient.delete(input),
    onMutate: async ({ id }) => {
      await cancelLiveQueries(queryClient);

      const previousTrashed = queryClient.getQueryData(['captures', 'trashed']);

      if (isCaptureHistoryData(previousTrashed)) {
        queryClient.setQueryData(
          ['captures', 'trashed'],
          mapCaptureHistoryPageItems(previousTrashed, (items) =>
            items.filter((capture) => capture.id !== id)
          )
        );
      }

      return { previousTrashed };
    },

    onError: (err, _variables, context) => {
      if (context?.previousTrashed) {
        queryClient.setQueryData(['captures', 'trashed'], context.previousTrashed);
      }

      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to delete');
      }
    },

    onSuccess: () => {
      toast.success('Permanently deleted');
    },

    onSettled: () => {
      void invalidateLiveQueries(queryClient);
    },
  });

  const emptyTrashMutation = useMutation({
    mutationFn: (input: Parameters<typeof captureClient.emptyTrash>[0]) =>
      captureClient.emptyTrash(input),
    onMutate: async () => {
      await cancelLiveQueries(queryClient);

      const previousTrashed = queryClient.getQueryData(['captures', 'trashed']);

      queryClient.setQueryData(['captures', 'trashed'], emptyCaptureHistoryPages());

      return { previousTrashed };
    },

    onError: (err, _variables, context) => {
      if (context?.previousTrashed) {
        queryClient.setQueryData(['captures', 'trashed'], context.previousTrashed);
      }

      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to empty trash');
      }
    },

    onSuccess: (response) => {
      const count = response.deletedCount;
      toast.success(`Deleted ${count} ${count === 1 ? 'item' : 'items'}`);
    },

    onSettled: () => {
      void invalidateLiveQueries(queryClient);
    },
  });

  const handleRestore = (id: string, direction: ExitDirection = 'left') => {
    setExitDirections((prev) => ({ ...prev, [id]: direction }));
    restoreMutation.mutate({ id });
  };

  const handleDelete = (id: string) => {
    setExitDirections((prev) => ({ ...prev, [id]: 'right' }));
    deleteMutation.mutate({ id });
    setDeleteConfirmId(null);
  };

  const handleEmptyTrash = () => {
    emptyTrashMutation.mutate({});
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
