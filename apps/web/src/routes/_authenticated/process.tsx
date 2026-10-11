import { createFileRoute, Link } from '@tanstack/react-router';
import { Inbox } from 'lucide-react';
import { Card, CardContent } from '@yoink/ui-base/components/card';
import { PILE_SAFETY_CAP } from '@yoink/api-contracts';
import { tsr, tsrLists, tsrProjects } from '@/api/client';
import { CaptureCard } from '@/components/capture-card';
import { AnimatedList, AnimatedListItem } from '@/components/animated-list';
import { ErrorState } from '@/components/error-state';
import { Header } from '@/components/header';
import { PlaceHeading } from '@/components/place-heading';
import { PromoteSheet } from '@/components/promote-sheet';
import { isBlockingQueryFailure } from '@/lib/live-query';
import { processQueueSubcopy, sortProcessQueue } from '@/lib/process-queue';
import { useInboxTriage } from '@/lib/use-inbox-triage';

export const Route = createFileRoute('/_authenticated/process')({
  component: ProcessPage,
});

function ProcessPage() {
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
    queryData: { query: { status: 'inbox', snoozed: false, limit: PILE_SAFETY_CAP } },
  });

  const captures = data?.status === 200 ? sortProcessQueue(data.body.captures) : [];
  const toProcessCount = data?.status === 200 ? data.body.total : 0;
  const ready = data?.status === 200;

  return (
    <div
      data-process-ready={ready ? '' : undefined}
      className="container mx-auto max-w-2xl p-4"
    >
      <Header />
      <PlaceHeading
        title="Process"
        subcopy={ready ? processQueueSubcopy(toProcessCount) : undefined}
        subcopyTestId="process-subcopy"
      />

      {isBlockingQueryFailure(error, data) && error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <p className="text-center text-muted-foreground">Loading...</p>
      ) : captures.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Inbox className="mx-auto mb-2 h-8 w-8" />
            <p>Nothing to process</p>
            <p className="text-sm">
              New captures land on{' '}
              <Link to="/" data-process-empty-capture="" className="text-foreground underline">
                Capture
              </Link>
            </p>
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
    </div>
  );
}
