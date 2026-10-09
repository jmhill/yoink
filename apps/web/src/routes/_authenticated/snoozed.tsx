import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { Card, CardContent } from '@yoink/ui-base/components/card';
import { tsr } from '@/api/client';
import { PILE_SAFETY_CAP } from '@yoink/api-contracts';
import { cancelLiveQueries, invalidateLiveQueries, isBlockingQueryFailure } from '@/lib/live-query';
import { isFetchError } from '@ts-rest/react-query/v5';
import { Inbox, AlarmClockOff, Clock } from 'lucide-react';
import { ErrorState } from '@/components/error-state';
import { CaptureSnippet, CAPTURE_ACTION_CLASS, CAPTURE_SNIPPET_CARD_CLASS } from '@/components/capture-snippet';
import { InboxPaneShell } from '@/components/inbox-pane-shell';
import { SwipeableCard } from '@/components/swipeable-card';
import { AnimatedList, AnimatedListItem, type ExitDirection } from '@/components/animated-list';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/snoozed')({
  component: SnoozedPage,
});

function SnoozedPage() {
  const [exitDirections, setExitDirections] = useState<Record<string, ExitDirection>>({});
  const tsrQueryClient = tsr.useQueryClient();

  const { data, isPending, error, refetch } = tsr.list.useQuery({
    queryKey: ['captures', 'snoozed'],
    queryData: { query: { status: 'inbox' as const, snoozed: true, limit: PILE_SAFETY_CAP } },
  });

  const unsnoozeMutation = tsr.unsnooze.useMutation({
    onMutate: async ({ params }) => {
      // Cancel in-flight queries to prevent overwrites
      await cancelLiveQueries(tsrQueryClient);

      // Snapshot current state for rollback
      const previousSnoozed = tsrQueryClient.list.getQueryData([
        'captures',
        'snoozed',
      ]);
      const previousInbox = tsrQueryClient.list.getQueryData([
        'captures',
        'inbox',
      ]);

      // Find the capture being unsnoozed
      if (previousSnoozed?.status === 200) {
        const captureToUnsnooze = previousSnoozed.body.captures.find(
          (c) => c.id === params.id
        );

        // Remove from snoozed
        tsrQueryClient.list.setQueryData(['captures', 'snoozed'], {
          ...previousSnoozed,
          body: {
            ...previousSnoozed.body,
            captures: previousSnoozed.body.captures.filter(
              (c) => c.id !== params.id
            ),
            total: Math.max(0, previousSnoozed.body.total - 1),
          },
        });

        // Add to inbox (if cache exists)
        if (captureToUnsnooze && previousInbox?.status === 200) {
          tsrQueryClient.list.setQueryData(['captures', 'inbox'], {
            ...previousInbox,
            body: {
              ...previousInbox.body,
              captures: [
                { ...captureToUnsnooze, snoozedUntil: undefined },
                ...previousInbox.body.captures,
              ],
              total: previousInbox.body.total + 1,
            },
          });
        }
      }

      return { previousSnoozed, previousInbox };
    },

    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousSnoozed) {
        tsrQueryClient.list.setQueryData(
          ['captures', 'snoozed'],
          context.previousSnoozed
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
        toast.error('Failed to unsnooze');
      }
    },

    onSuccess: () => {
      toast.success('Moved to inbox');
    },

    onSettled: () => {
      // Refetch to ensure consistency with server
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  const handleUnsnooze = (id: string, direction: ExitDirection = 'right') => {
    setExitDirections((prev) => ({ ...prev, [id]: direction }));
    unsnoozeMutation.mutate({
      params: { id },
      body: {},
    });
  };

  const formatWakeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Waking soon';
    if (diffMins < 60) return `Waking in ${diffMins}m`;
    if (diffHours < 24) return `Waking in ${diffHours}h`;
    if (diffDays < 7) return `Waking in ${diffDays}d`;
    return `Waking ${date.toLocaleDateString()}`;
  };

  const captures = data?.status === 200 ? data.body.captures : [];

  return (
    <InboxPaneShell active="snoozed">
      {isBlockingQueryFailure(error, data) && error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <p className="text-center text-muted-foreground">Loading...</p>
      ) : captures.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Clock className="mx-auto mb-2 h-8 w-8" />
            <p>No snoozed captures</p>
            <p className="text-sm">Snoozed items will appear here until they wake up</p>
          </CardContent>
        </Card>
      ) : (
        <AnimatedList>
          {captures.map((capture) => (
            <AnimatedListItem
              key={capture.id}
              id={capture.id}
              exitDirection={exitDirections[capture.id] ?? 'right'}
            >
              <SwipeableCard
                data-capture-id={capture.id}
                className={CAPTURE_SNIPPET_CARD_CLASS}
                rightAction={{
                  icon: <Inbox className="h-5 w-5" />,
                  label: 'Wake up',
                  type: 'restore',
                  onAction: (direction) => handleUnsnooze(capture.id, direction === 'right' ? 'right' : 'left'),
                }}
                disabled={unsnoozeMutation.isPending}
              >
                <CaptureSnippet
                  content={capture.content}
                  sourceUrl={capture.sourceUrl}
                  sourceApp={capture.sourceApp}
                  capturedAt={capture.capturedAt}
                  meta={
                    capture.snoozedUntil ? (
                      <span className="shrink-0"> · {formatWakeTime(capture.snoozedUntil)}</span>
                    ) : null
                  }
                  actions={
                    <Button
                      variant="ghost"
                      className={CAPTURE_ACTION_CLASS}
                      onClick={() => handleUnsnooze(capture.id, 'right')}
                      disabled={unsnoozeMutation.isPending}
                      title="Wake up now"
                      aria-label="Unsnooze"
                    >
                      <AlarmClockOff className="h-4 w-4" />
                      Unsnooze
                    </Button>
                  }
                />
              </SwipeableCard>
            </AnimatedListItem>
          ))}
        </AnimatedList>
      )}
    </InboxPaneShell>
  );
}
