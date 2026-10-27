import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { Button } from '@yoink/ui-base/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@yoink/ui-base/components/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@yoink/ui-base/components/drawer';
import { PILE_SAFETY_CAP, type Project, type ReviewProject } from '@yoink/api-contracts';
import { memberLabel } from '@/api/auth';
import {
  tsrAuth,
  tsrLists,
  tsrOrganizations,
  tsrProjects,
  tsrReview,
} from '@/api/client';
import { ConfirmProposalSheet } from '@/components/confirm-proposal-sheet';
import { CreateProjectDialog } from '@/components/create-project-dialog';
import { ErrorState } from '@/components/error-state';
import { Header } from '@/components/header';
import { NextActionPicker } from '@/components/next-action-picker';
import { PlaceHeading } from '@/components/place-heading';
import { ProjectStatusControl } from '@/components/project-status-control';
import { ReviewAllProjects, ReviewDoneThisWeekSlot } from '@/components/review-all-projects';
import { ReviewProposalCard } from '@/components/review-proposal-card';
import { ReviewRow } from '@/components/review-row';
import { isBlockingQueryFailure } from '@/lib/live-query';
import { proposerLabel } from '@/lib/proposal-copy';
import { reviewSubcopy } from '@/lib/review-copy';
import { proposedProjectsByName } from '@/lib/review-proposals';
import {
  groupWaitingProjects,
  partitionReviewSections,
  reviewAttentionTotal,
  reviewVersionOf,
} from '@/lib/review-sections';
import { useDesktopLayout } from '@/lib/use-desktop-layout';
import { useProcessCounts } from '@/lib/use-process-counts';
import { useProposalActions } from '@/lib/use-proposal-actions';
import { useReviewActions } from '@/lib/use-review-actions';
import { viewerTimeZone } from '@/lib/viewer-today';

const searchSchema = z.object({
  doneWeek: z.string().date().optional(),
});

export const Route = createFileRoute('/_authenticated/projects')({
  validateSearch: searchSchema,
  component: ReviewPage,
});

function ReviewPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const timeZone = viewerTimeZone();
  const isDesktop = useDesktopLayout();
  const [createOpen, setCreateOpen] = useState(false);
  const [nextActionFor, setNextActionFor] = useState<Project | null>(null);
  const [statusFor, setStatusFor] = useState<ReviewProject | null>(null);
  const [waitingFormOpen, setWaitingFormOpen] = useState(false);
  const queryClient = tsrReview.useQueryClient();
  const actions = useReviewActions();
  const { proposals: proposedPage, proposalsQuery } = useProcessCounts();

  const reviewQuery = tsrReview.list.useQuery({
    queryKey: ['review'],
    queryData: { query: { limit: PILE_SAFETY_CAP, timeZone } },
  });
  const doneQuery = tsrReview.done.useQuery({
    queryKey: ['review', 'done', search.doneWeek ?? 'current'],
    queryData: {
      query: {
        limit: PILE_SAFETY_CAP,
        ...(search.doneWeek === undefined ? {} : { week: search.doneWeek }),
      },
    },
  });
  const projectsQuery = tsrProjects.list.useQuery({
    queryKey: ['projects'],
    queryData: { query: { limit: PILE_SAFETY_CAP } },
    refetchInterval: false,
  });
  const listsQuery = tsrLists.list.useQuery({
    queryKey: ['lists'],
    queryData: { query: { limit: PILE_SAFETY_CAP } },
    refetchInterval: false,
  });
  const sessionQuery = tsrAuth.session.useQuery({
    queryKey: ['session'],
    queryData: {},
    refetchInterval: false,
  });
  const organizationId =
    sessionQuery.data?.status === 200 ? sessionQuery.data.body.organizationId : undefined;
  const viewerId = sessionQuery.data?.status === 200 ? sessionQuery.data.body.user.id : undefined;
  const viewerEmail =
    sessionQuery.data?.status === 200 ? sessionQuery.data.body.user.email : undefined;
  const membersQuery = tsrOrganizations.listMembers.useQuery({
    queryKey: ['organization-members', organizationId ?? ''],
    queryData: { params: { organizationId: organizationId ?? '' } },
    enabled: Boolean(organizationId),
    refetchInterval: false,
  });

  const sheetProjectId = nextActionFor?.id ?? statusFor?.project.id ?? '';
  const openTasksQuery = tsrProjects.listOpenTasks.useQuery({
    queryKey: ['tasks', 'project', sheetProjectId],
    queryData: {
      params: { id: sheetProjectId },
      query: { limit: PILE_SAFETY_CAP },
    },
    enabled: sheetProjectId.length > 0,
  });

  const memberRecords =
    membersQuery.data?.status === 200 ? membersQuery.data.body.members : [];
  const viewerMember = memberRecords.find((member) => member.userId === viewerId);
  const restoredByName = proposerLabel(
    viewerMember ?? (viewerEmail ? { kind: 'human', email: viewerEmail } : undefined)
  );
  const proposalActions = useProposalActions(restoredByName);
  const proposals = proposedProjectsByName(proposedPage);
  const proposerName = (project: Project) =>
    proposerLabel(memberRecords.find((member) => member.userId === project.createdById));

  if (isBlockingQueryFailure(reviewQuery.error, reviewQuery.data) && reviewQuery.error) {
    return <ErrorState error={reviewQuery.error} onRetry={() => reviewQuery.refetch()} />;
  }
  if (
    isBlockingQueryFailure(proposalsQuery.error, proposalsQuery.data) &&
    proposalsQuery.error
  ) {
    return (
      <ErrorState
        error={proposalsQuery.error}
        onRetry={() => {
          void proposalsQuery.refetch();
        }}
      />
    );
  }

  const reviewProjects = reviewQuery.data?.status === 200 ? reviewQuery.data.body.projects : [];
  const today = reviewQuery.data?.status === 200 ? reviewQuery.data.body.today : '';
  const donePage = doneQuery.data?.status === 200 ? doneQuery.data.body : null;
  const allProjects = projectsQuery.data?.status === 200 ? projectsQuery.data.body.projects : [];
  const namedLists = listsQuery.data?.status === 200 ? listsQuery.data.body.lists : [];
  const members =
    membersQuery.data?.status === 200
      ? membersQuery.data.body.members.map((member) => ({
          userId: member.userId,
          label: memberLabel(member),
        }))
      : [];
  const openTasks = openTasksQuery.data?.status === 200 ? openTasksQuery.data.body.tasks : [];
  const ready = reviewQuery.data?.status === 200;
  const sections = partitionReviewSections(reviewProjects);
  const waitingGroups = groupWaitingProjects(sections.waiting);
  const attentionCount = reviewAttentionTotal(reviewProjects, proposals.length);
  const version = ready ? reviewVersionOf(reviewProjects) : '';

  const closeNextAction = () => setNextActionFor(null);
  const closeStatus = () => {
    setStatusFor(null);
    setWaitingFormOpen(false);
  };

  const statusSheet = statusFor ? (
    <ProjectStatusControl
      project={statusFor.project}
      openTaskCount={openTasks.length}
      isPending={actions.isStatusPending}
      error={actions.statusError}
      waitingFormOpen={waitingFormOpen}
      onWaitingFormOpenChange={setWaitingFormOpen}
      onChangeStatus={(input) => {
        actions.changeStatus({ project: statusFor.project, body: input });
        closeStatus();
      }}
    />
  ) : null;

  return (
    <div
      data-review-ready={ready ? '' : undefined}
      data-review-proposals-ready={proposalsQuery.data?.status === 200 ? '' : undefined}
      data-review-version={ready ? version : undefined}
      className="container mx-auto max-w-2xl p-4"
    >
      <Header />
      <PlaceHeading
        title="Review"
        subcopy={reviewQuery.isPending ? 'Loading…' : reviewSubcopy(attentionCount)}
        subcopyTestId="review-subcopy"
      />

      {proposals.length > 0 ? (
        <section data-review-section="proposed" className="mt-6 space-y-2">
          <h2 className="text-sm font-medium text-foreground">Proposed</h2>
          <ul className="space-y-2">
            {proposals.map((project) => (
              <ReviewProposalCard
                key={project.id}
                project={project}
                proposerName={proposerName(project)}
                onConfirm={proposalActions.openConfirm}
                onTurnDown={proposalActions.handleTurnDown}
                disabled={proposalActions.isBusy}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {ready && reviewProjects.length === 0 && proposals.length === 0 ? (
        <p data-review-empty="" className="text-sm text-muted-foreground">
          Nothing needs attention
        </p>
      ) : null}

      {sections.noNextAction.length > 0 ? (
        <section data-review-section="noNextAction" className="mt-6 space-y-2">
          <h2 className="text-sm font-medium text-foreground">Needs a next action</h2>
          <ul className="space-y-2">
            {sections.noNextAction.map((item) => (
              <ReviewRow
                key={item.project.id}
                item={item}
                today={today}
                timeZone={timeZone}
                onSetNextAction={(item) => setNextActionFor(item.project)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {sections.quiet.length > 0 ? (
        <section data-review-section="quiet" className="mt-6 space-y-2">
          <h2 className="text-sm font-medium text-foreground">No change in 7 days</h2>
          <ul className="space-y-2">
            {sections.quiet.map((item) => (
              <ReviewRow
                key={item.project.id}
                item={item}
                today={today}
                timeZone={timeZone}
                onSetNextAction={(item) => setNextActionFor(item.project)}
                onChangeStatus={setStatusFor}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {waitingGroups.length > 0 ? (
        <section data-review-section="waiting" className="mt-6 space-y-4">
          <h2 className="text-sm font-medium text-foreground">Waiting</h2>
          {waitingGroups.map((group) => (
            <div key={group.key} data-review-waiting-group={group.key} className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {group.label}
              </h3>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <ReviewRow
                    key={item.project.id}
                    item={item}
                    today={today}
                    timeZone={timeZone}
                    onChangeStatus={setStatusFor}
                  />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      <ReviewDoneThisWeekSlot
        page={donePage}
        onSetNextAction={setNextActionFor}
        onPreviousWeek={() => {
          if (donePage === null) {
            return;
          }
          void navigate({
            to: '/projects',
            search: { doneWeek: donePage.previousWeek },
          });
        }}
        onNextWeek={() => {
          if (donePage?.nextWeek === null || donePage === null) {
            return;
          }
          void navigate({
            to: '/projects',
            search: { doneWeek: donePage.nextWeek },
          });
        }}
      />

      <ReviewAllProjects
        projects={allProjects}
        proposals={proposals}
        proposerName={proposerName}
        onNewProject={() => setCreateOpen(true)}
      />

      <ConfirmProposalSheet
        open={proposalActions.confirmOpen}
        onOpenChange={proposalActions.setConfirmOpen}
        project={proposalActions.activeProject}
        onConfirm={proposalActions.handleConfirm}
        isLoading={proposalActions.isBusy}
        error={proposalActions.confirmError}
      />

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(project) => {
          void queryClient.invalidateQueries({ queryKey: ['review'] });
          void navigate({
            to: '/projects/$projectId',
            params: { projectId: project.id },
          });
        }}
      />

      <NextActionPicker
        open={nextActionFor !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeNextAction();
          }
        }}
        title="Set next action"
        description="Pick an open task or create one."
        testId="review-set-next-action"
        openTasks={openTasks}
        lists={namedLists.map((list) => ({ id: list.id, name: list.name }))}
        members={members}
        isPending={actions.isNextActionPending}
        error={actions.nextActionError}
        onPickTask={(taskId) => {
          if (!nextActionFor) {
            return;
          }
          actions.setNextAction({ project: nextActionFor, body: { taskId } });
          closeNextAction();
        }}
        onCreateTask={(newTask) => {
          if (!nextActionFor) {
            return;
          }
          actions.setNextAction({ project: nextActionFor, body: { newTask } });
          closeNextAction();
        }}
        extraActions={
          <Button type="button" variant="outline" data-review-set-next-skip="" onClick={closeNextAction}>
            Skip
          </Button>
        }
      />

      {isDesktop ? (
        <Dialog
          open={statusFor !== null}
          onOpenChange={(open) => {
            if (!open) {
              closeStatus();
            }
          }}
        >
          <DialogContent data-review-change-status-sheet="">
            <DialogHeader>
              <DialogTitle>Change status</DialogTitle>
              <DialogDescription>
                {statusFor ? `Update ${statusFor.project.name}.` : 'Update this project.'}
              </DialogDescription>
            </DialogHeader>
            {statusSheet}
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer
          open={statusFor !== null}
          onOpenChange={(open) => {
            if (!open) {
              closeStatus();
            }
          }}
        >
          <DrawerContent data-review-change-status-sheet="">
            <DrawerHeader>
              <DrawerTitle>Change status</DrawerTitle>
              <DrawerDescription>
                {statusFor ? `Update ${statusFor.project.name}.` : 'Update this project.'}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-4">{statusSheet}</div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}
