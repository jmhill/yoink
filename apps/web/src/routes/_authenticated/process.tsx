import { useEffect, useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Inbox } from 'lucide-react';
import { Card, CardContent } from '@yoink/ui-base/components/card';
import { PILE_SAFETY_CAP } from '@yoink/api-contracts';
import { tsr, tsrLists, tsrProjects } from '@/api/client';
import { ErrorState } from '@/components/error-state';
import { Header } from '@/components/header';
import { PlaceHeading } from '@/components/place-heading';
import { ProcessItem } from '@/components/process-item';
import { ProcessProjectSheet } from '@/components/process-project-sheet';
import { PromoteSheet } from '@/components/promote-sheet';
import { isBlockingQueryFailure } from '@/lib/live-query';
import { processEmptySnoozedCopy, processQueue, processQueueSubcopy } from '@/lib/process-queue';
import { processKeyAction } from '@/lib/process-keys';
import { useDesktopLayout } from '@/lib/use-desktop-layout';
import { useInboxTriage } from '@/lib/use-inbox-triage';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/process')({
  component: ProcessPage,
});

function ProcessPage() {
  const {
    taskModalOpen,
    setTaskModalOpen,
    taskModalCapture,
    projectSheetOpen,
    setProjectSheetOpen,
    projectSheetStatus,
    projectSheetCapture,
    projectSheetError,
    isTrashing,
    isSnoozing,
    isProcessing,
    wasActed,
    handleTrash,
    handleSnooze,
    handleProcessToTask,
    handleConfirmPromote,
    handleOpenProjectSheet,
    handleConfirmProject,
  } = useInboxTriage();
  const desktop = useDesktopLayout();
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const previousCurrentId = useRef<string | null>(null);

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
  const { data: snoozedData } = tsr.list.useQuery({
    queryKey: ['captures', 'snoozed'],
    queryData: { query: { status: 'inbox', snoozed: true, limit: PILE_SAFETY_CAP } },
  });

  const captures = data?.status === 200 ? data.body.captures : [];
  const queue = processQueue(captures);
  const current = queue.current?.kind === 'capture' ? queue.current.capture : null;
  const left = data?.status === 200 ? data.body.total : queue.left;
  const snoozedCount = snoozedData?.status === 200 ? snoozedData.body.total : 0;
  const ready = data?.status === 200;
  const snoozedCopy = processEmptySnoozedCopy(snoozedCount);
  const sheetOpen = taskModalOpen || projectSheetOpen || snoozeOpen;

  useEffect(() => {
    const previous = previousCurrentId.current;
    const next = current?.id ?? null;
    if (previous !== null && previous !== next && !wasActed(previous)) {
      toast('That capture was already processed');
    }
    previousCurrentId.current = next;
  }, [current?.id, wasActed]);

  useEffect(() => {
    if (!desktop || !current || sheetOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const action = processKeyAction(event);
      if (action === null) {
        return;
      }
      event.preventDefault();
      switch (action) {
        case 'make-task':
          handleProcessToTask({ id: current.id, content: current.content });
          return;
        case 'new-project':
          handleOpenProjectSheet(current, 'active');
          return;
        case 'someday-project':
          handleOpenProjectSheet(current, 'someday');
          return;
        case 'snooze':
          setSnoozeOpen(true);
          return;
        case 'trash':
          handleTrash(current.id, 'right');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [desktop, current, sheetOpen, handleProcessToTask, handleOpenProjectSheet, handleTrash]);

  return (
    <div
      data-process-ready={ready ? '' : undefined}
      data-process-current={current?.id}
      data-process-left={ready ? String(left) : undefined}
      className="container mx-auto max-w-2xl p-4"
    >
      <Header />
      <PlaceHeading
        title="Process"
        subcopy={ready ? processQueueSubcopy(left) : undefined}
        subcopyTestId="process-subcopy"
      />

      {isBlockingQueryFailure(error, data) && error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <p className="text-center text-muted-foreground">Loading...</p>
      ) : current === null ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Inbox className="mx-auto mb-2 h-8 w-8" />
            <p>Nothing to process</p>
            {snoozedCopy ? (
              <p data-process-snoozed-count="" className="text-sm">
                {snoozedCopy}
              </p>
            ) : null}
            <p className="text-sm">
              New captures land on{' '}
              <Link to="/" data-process-empty-capture="" className="text-foreground underline">
                Capture
              </Link>
            </p>
          </CardContent>
        </Card>
      ) : (
        <ProcessItem
          capture={current}
          onMakeTask={handleProcessToTask}
          onNewProject={(capture) => handleOpenProjectSheet(capture, 'active')}
          onSomedayProject={(capture) => handleOpenProjectSheet(capture, 'someday')}
          onSnooze={(id, option) => handleSnooze(id, option, 'left')}
          onTrash={(id) => handleTrash(id, 'right')}
          snoozeOpen={snoozeOpen}
          onSnoozeOpenChange={setSnoozeOpen}
          disabled={isTrashing || isSnoozing || isProcessing}
        />
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
      <ProcessProjectSheet
        open={projectSheetOpen}
        onOpenChange={setProjectSheetOpen}
        capture={projectSheetCapture}
        status={projectSheetStatus}
        onConfirm={handleConfirmProject}
        isLoading={isProcessing}
        error={projectSheetError}
      />
    </div>
  );
}
