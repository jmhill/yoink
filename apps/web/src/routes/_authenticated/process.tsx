import { useEffect, useRef, useState } from 'react';
import { createFileRoute, Link, useRouterState } from '@tanstack/react-router';
import { Inbox } from 'lucide-react';
import { Card, CardContent } from '@yoink/ui-base/components/card';
import { PILE_SAFETY_CAP } from '@yoink/api-contracts';
import { tsr, tsrAuth, tsrLists, tsrOrganizations, tsrProjects } from '@/api/client';
import { ConfirmProposalSheet } from '@/components/confirm-proposal-sheet';
import { ErrorState } from '@/components/error-state';
import { Header } from '@/components/header';
import { PlaceHeading } from '@/components/place-heading';
import { ProcessItem } from '@/components/process-item';
import { ProcessProjectSheet } from '@/components/process-project-sheet';
import { ProcessProposalItem } from '@/components/process-proposal-item';
import { PromoteSheet } from '@/components/promote-sheet';
import { ProposalEditSheet } from '@/components/proposal-edit-sheet';
import { isBlockingQueryFailure } from '@/lib/live-query';
import { processEmptySnoozedCopy, processQueue, processQueueSubcopy } from '@/lib/process-queue';
import {
  processKeyAction,
  shouldListenForProcessKeys,
  shouldReleaseProcessKeyLock,
} from '@/lib/process-keys';
import { proposerLabel } from '@/lib/proposal-copy';
import { useDesktopLayout } from '@/lib/use-desktop-layout';
import { useInboxTriage } from '@/lib/use-inbox-triage';
import { useProcessCounts } from '@/lib/use-process-counts';
import { useProposalActions } from '@/lib/use-proposal-actions';
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const previousCurrentId = useRef<string | null>(null);
  const keyLock = useRef(false);
  const keyLockId = useRef<string | null>(null);
  const [keyLockNonce, setKeyLockNonce] = useState(0);
  const [keyLocked, setKeyLocked] = useState(false);

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

  const { data: sessionData } = tsrAuth.session.useQuery({
    queryKey: ['session'],
    queryData: {},
    refetchInterval: false,
  });
  const organizationId = sessionData?.status === 200 ? sessionData.body.organizationId : undefined;
  const viewerId = sessionData?.status === 200 ? sessionData.body.user.id : undefined;
  const viewerEmail = sessionData?.status === 200 ? sessionData.body.user.email : undefined;

  const membersQuery = tsrOrganizations.listMembers.useQuery({
    queryKey: ['organization-members', organizationId ?? ''],
    queryData: { params: { organizationId: organizationId ?? '' } },
    enabled: Boolean(organizationId),
    refetchInterval: false,
  });
  const members = membersQuery.data?.status === 200 ? membersQuery.data.body.members : [];
  const viewerMember = members.find((member) => member.userId === viewerId);
  const restoredByName = proposerLabel(
    viewerMember ?? (viewerEmail ? { kind: 'human', email: viewerEmail } : undefined)
  );

  const {
    inboxQuery,
    proposalsQuery,
    proposals,
    total,
  } = useProcessCounts();
  const proposalActions = useProposalActions(restoredByName);

  const { data: snoozedData } = tsr.list.useQuery({
    queryKey: ['captures', 'snoozed'],
    queryData: { query: { status: 'inbox', snoozed: true, limit: PILE_SAFETY_CAP } },
  });

  const captures = inboxQuery.data?.status === 200 ? inboxQuery.data.body.captures : [];
  const queue = processQueue(captures, proposals);
  const currentItem = queue.current;
  const currentCapture = currentItem?.kind === 'capture' ? currentItem.capture : null;
  const currentProposal = currentItem?.kind === 'proposal' ? currentItem.project : null;
  const currentId = currentCapture?.id ?? currentProposal?.id ?? null;
  const left = total;
  const snoozedCount = snoozedData?.status === 200 ? snoozedData.body.total : 0;
  const ready = inboxQuery.data?.status === 200 && proposalsQuery.data?.status === 200;
  const snoozedCopy = processEmptySnoozedCopy(snoozedCount);
  const sheetOpen =
    taskModalOpen ||
    projectSheetOpen ||
    snoozeOpen ||
    proposalActions.confirmOpen ||
    proposalActions.editOpen;
  const actionPending = isTrashing || isSnoozing || isProcessing || proposalActions.isBusy;
  const inboxIdKey = captures.map((capture) => capture.id).join(',');
  const proposalIdKey = proposals.map((project) => project.id).join(',');
  const queueIdKey = `${inboxIdKey}|${proposalIdKey}`;

  useEffect(() => {
    if (
      !shouldReleaseProcessKeyLock({
        actionPending,
        lockedId: keyLockId.current,
        currentId,
      })
    ) {
      return;
    }
    keyLock.current = false;
    keyLockId.current = null;
    setKeyLocked(false);
  }, [actionPending, keyLockNonce, currentId]);

  useEffect(() => {
    const previous = previousCurrentId.current;
    const next = currentId;
    const queueIds = queueIdKey === '|' ? [] : queueIdKey.split('|').flatMap((part) =>
      part === '' ? [] : part.split(',')
    );
    if (previous !== null && !queueIds.includes(previous) && !wasActed(previous) && !proposalActions.wasActed(previous)) {
      toast('That capture was already processed');
    }
    previousCurrentId.current = next;
  }, [currentId, queueIdKey, wasActed, proposalActions.wasActed]);

  useEffect(() => {
    if (
      !shouldListenForProcessKeys({
        desktop,
        hasCurrent: currentCapture !== null,
        sheetOpen,
        actionPending,
        pathname,
      })
    ) {
      return;
    }
    if (!currentCapture) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (keyLock.current) {
        return;
      }
      const action = processKeyAction(event);
      if (action === null) {
        return;
      }
      event.preventDefault();
      if (action === 'trash') {
        keyLock.current = true;
        keyLockId.current = currentCapture.id;
        setKeyLocked(true);
        setKeyLockNonce((nonce) => nonce + 1);
      }
      switch (action) {
        case 'make-task':
          handleProcessToTask({ id: currentCapture.id, content: currentCapture.content });
          return;
        case 'new-project':
          handleOpenProjectSheet(currentCapture, 'active');
          return;
        case 'someday-project':
          handleOpenProjectSheet(currentCapture, 'someday');
          return;
        case 'snooze':
          setSnoozeOpen(true);
          return;
        case 'trash':
          handleTrash(currentCapture.id, 'right');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    desktop,
    currentCapture,
    sheetOpen,
    actionPending,
    pathname,
    handleProcessToTask,
    handleOpenProjectSheet,
    handleTrash,
  ]);

  const inboxBlocked =
    isBlockingQueryFailure(inboxQuery.error, inboxQuery.data) && inboxQuery.error;
  const proposalsBlocked =
    isBlockingQueryFailure(proposalsQuery.error, proposalsQuery.data) && proposalsQuery.error;
  const blockedError = inboxBlocked || proposalsBlocked;
  const isPending = inboxQuery.isPending || proposalsQuery.isPending;
  const currentProposer = currentProposal
    ? proposerLabel(members.find((member) => member.userId === currentProposal.createdById))
    : 'Unknown';

  return (
    <div
      data-process-ready={ready ? '' : undefined}
      data-process-current={currentId ?? undefined}
      data-process-kind={currentItem?.kind}
      data-process-left={ready ? String(left) : undefined}
      data-process-key-lock={keyLocked ? '' : undefined}
      className="container mx-auto max-w-2xl p-4"
    >
      <Header />
      <PlaceHeading
        title="Process"
        subcopy={ready && currentItem !== null ? processQueueSubcopy(left) : undefined}
        subcopyTestId="process-subcopy"
      />

      {blockedError ? (
        <ErrorState
          error={blockedError}
          onRetry={() => {
            void inboxQuery.refetch();
            void proposalsQuery.refetch();
          }}
        />
      ) : isPending ? (
        <p className="text-center text-muted-foreground">Loading...</p>
      ) : currentItem === null ? (
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
      ) : currentCapture ? (
        <ProcessItem
          capture={currentCapture}
          onMakeTask={handleProcessToTask}
          onNewProject={(capture) => handleOpenProjectSheet(capture, 'active')}
          onSomedayProject={(capture) => handleOpenProjectSheet(capture, 'someday')}
          onSnooze={(id, option) => handleSnooze(id, option, 'left')}
          onTrash={(id) => handleTrash(id, 'right')}
          snoozeOpen={snoozeOpen}
          onSnoozeOpenChange={setSnoozeOpen}
          disabled={actionPending}
        />
      ) : currentProposal ? (
        <ProcessProposalItem
          project={currentProposal}
          proposerName={currentProposer}
          onConfirm={proposalActions.openConfirm}
          onEdit={proposalActions.openEdit}
          onTurnDown={proposalActions.handleTurnDown}
          disabled={actionPending}
        />
      ) : null}

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
      <ConfirmProposalSheet
        open={proposalActions.confirmOpen}
        onOpenChange={proposalActions.setConfirmOpen}
        project={proposalActions.activeProject}
        onConfirm={proposalActions.handleConfirm}
        isLoading={proposalActions.isBusy}
        error={proposalActions.confirmError}
      />
      <ProposalEditSheet
        open={proposalActions.editOpen}
        onOpenChange={proposalActions.setEditOpen}
        project={proposalActions.activeProject}
        onSave={proposalActions.handleEdit}
        isLoading={proposalActions.isBusy}
        error={proposalActions.editError}
      />
    </div>
  );
}
