import { createFileRoute } from '@tanstack/react-router';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { consumeQuickCaptureFocus } from '@/lib/quick-capture-shortcut';
import { QuickCaptureField } from '@/components/quick-capture-field';
import { Card, CardContent } from '@yoink/ui-base/components/card';
import { tsr, tsrLists, tsrProjects } from '@/api/client';
import { PILE_SAFETY_CAP } from '@yoink/api-contracts';
import { cancelLiveQueries, invalidateLiveQueries, isBlockingQueryFailure } from '@/lib/live-query';
import { useInboxTriage } from '@/lib/use-inbox-triage';
import { useNetworkStatus } from '@/lib/use-network-status';
import { isFetchError } from '@ts-rest/react-query/v5';
import { Inbox } from 'lucide-react';
import { ErrorState } from '@/components/error-state';
import { CaptureCard } from '@/components/capture-card';
import { InboxPaneShell } from '@/components/inbox-pane-shell';
import { PromoteSheet } from '@/components/promote-sheet';
import { AnimatedList, AnimatedListItem } from '@/components/animated-list';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/')({
  component: InboxPage,
});

function InboxPage() {
  const isOnline = useNetworkStatus();
  const [newContent, setNewContent] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const tsrQueryClient = tsr.useQueryClient();
  const {
    exitDirections,
    taskModalOpen,
    setTaskModalOpen,
    taskModalCapture,
    isTrashing,
    isSnoozing,
    isProcessing,
    handleTrash,
    handleSnooze,
    handleProcessToTask,
    handleConfirmPromote,
  } = useInboxTriage();

  useEffect(() => {
    if (!consumeQuickCaptureFocus()) {
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const { data: listsData } = tsrLists.list.useQuery({
    queryKey: ['lists'],
    queryData: { query: { limit: PILE_SAFETY_CAP } },
  });
  const namedLists = listsData?.status === 200 ? listsData.body.lists : [];
  const { data: projectsData } = tsrProjects.list.useQuery({
    queryKey: ['projects'],
    queryData: { query: { limit: PILE_SAFETY_CAP } },
    refetchInterval: false,
  });
  const projects = projectsData?.status === 200 ? projectsData.body.projects : [];

  const { data, isPending, error, refetch } = tsr.list.useQuery({
    queryKey: ['captures', 'inbox'],
    queryData: { query: { status: 'inbox' as const, snoozed: false, limit: PILE_SAFETY_CAP } },
  });

  const createMutation = tsr.create.useMutation({
    onMutate: async ({ body }) => {
      // Cancel in-flight queries to prevent overwrites
      await cancelLiveQueries(tsrQueryClient);

      // Snapshot current state for rollback
      const previousInbox = tsrQueryClient.list.getQueryData([
        'captures',
        'inbox',
      ]);

      // Create optimistic capture with temp ID
      const optimisticCapture = {
        id: `temp-${Date.now()}`,
        organizationId: 'temp',
        createdById: 'temp',
        content: body.content,
        title: body.title,
        sourceUrl: body.sourceUrl,
        sourceApp: body.sourceApp ?? 'web',
        status: 'inbox' as const,
        capturedAt: new Date().toISOString(),
      };

      if (previousInbox?.status === 200) {
        tsrQueryClient.list.setQueryData(['captures', 'inbox'], {
          ...previousInbox,
          body: {
            ...previousInbox.body,
            captures: [optimisticCapture, ...previousInbox.body.captures],
            total: previousInbox.body.total + 1,
          },
        });
      }

      // Clear input immediately for snappy UX
      setNewContent('');

      return { previousInbox, previousContent: body.content };
    },

    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousInbox) {
        tsrQueryClient.list.setQueryData(
          ['captures', 'inbox'],
          context.previousInbox
        );
      }
      // Restore the input content so user doesn't lose their text
      if (context?.previousContent) {
        setNewContent(context.previousContent);
      }

      // Show error toast
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to add capture');
      }
    },

    onSuccess: () => {
      toast.success('Capture added');
    },

    onSettled: () => {
      // Refetch to ensure consistency with server (replaces temp ID with real one)
      void invalidateLiveQueries(tsrQueryClient);
      // Keep focus on input for rapid multi-capture
      // Use requestAnimationFrame to ensure focus happens after React's render cycle
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    },
  });

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    createMutation.mutate({
      body: { content: newContent.trim(), sourceApp: 'web' },
    });
  };

  const captures = data?.status === 200 ? data.body.captures : [];

  return (
    <InboxPaneShell active="inbox">
      <form onSubmit={handleQuickAdd} className="mb-6">
        <div className="flex gap-2">
          <QuickCaptureField
            inputRef={inputRef}
            value={newContent}
            onChange={setNewContent}
            placeholder={isOnline ? 'Quick capture...' : 'Offline - cannot add captures'}
            disabled={createMutation.isPending || !isOnline}
          />
          <Button type="submit" disabled={createMutation.isPending || !newContent.trim() || !isOnline}>
            {createMutation.isPending ? '...' : 'Add'}
          </Button>
        </div>
      </form>

      {isBlockingQueryFailure(error, data) && error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <p className="text-center text-muted-foreground">Loading...</p>
      ) : captures.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Inbox className="mx-auto mb-2 h-8 w-8" />
            <p>Your inbox is empty</p>
            <p className="text-sm">Add a quick capture above to get started</p>
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
              <CaptureCard
                capture={capture}
                onTrash={handleTrash}
                onSnooze={handleSnooze}
                onProcessToTask={handleProcessToTask}
                isTrashing={isTrashing}
                isSnoozing={isSnoozing}
                isProcessing={isProcessing}
              />
            </AnimatedListItem>
          ))}
        </AnimatedList>
      )}

      <PromoteSheet
        open={taskModalOpen}
        onOpenChange={setTaskModalOpen}
        capture={taskModalCapture}
        lists={namedLists}
        projects={projects}
        onConfirm={handleConfirmPromote}
        isLoading={isProcessing}
      />
    </InboxPaneShell>
  );
}
