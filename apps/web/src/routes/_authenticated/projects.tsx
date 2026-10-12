import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
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
import { PILE_SAFETY_CAP, type ReviewProject } from '@yoink/api-contracts';
import { memberLabel } from '@/api/auth';
import {
  tsrAuth,
  tsrLists,
  tsrOrganizations,
  tsrProjects,
  tsrReview,
} from '@/api/client';
import { CreateProjectDialog } from '@/components/create-project-dialog';
import { ErrorState } from '@/components/error-state';
import { Header } from '@/components/header';
import { NextActionPicker } from '@/components/next-action-picker';
import { PlaceHeading } from '@/components/place-heading';
import { ProjectStatusControl } from '@/components/project-status-control';
import { ReviewAllProjects, ReviewDoneThisWeekSlot } from '@/components/review-all-projects';
import { ReviewRow } from '@/components/review-row';
import { isBlockingQueryFailure } from '@/lib/live-query';
import { reviewSubcopy } from '@/lib/review-copy';
import {
  groupWaitingProjects,
  partitionReviewSections,
  reviewAttentionCount,
  reviewVersionOf,
} from '@/lib/review-sections';
import { useDesktopLayout } from '@/lib/use-desktop-layout';
import { useReviewActions } from '@/lib/use-review-actions';
import { viewerTimeZone } from '@/lib/viewer-today';

export const Route = createFileRoute('/_authenticated/projects')({
  component: ReviewPage,
});

function ReviewPage() {
  const navigate = useNavigate();
  const timeZone = viewerTimeZone();
  const isDesktop = useDesktopLayout();
  const [createOpen, setCreateOpen] = useState(false);
  const [nextActionFor, setNextActionFor] = useState<ReviewProject | null>(null);
  const [statusFor, setStatusFor] = useState<ReviewProject | null>(null);
  const [waitingFormOpen, setWaitingFormOpen] = useState(false);
  const queryClient = tsrReview.useQueryClient();
  const actions = useReviewActions();

  const reviewQuery = tsrReview.list.useQuery({
    queryKey: ['review'],
    queryData: { query: { limit: PILE_SAFETY_CAP, timeZone } },
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
  const membersQuery = tsrOrganizations.listMembers.useQuery({
    queryKey: ['organization-members', organizationId ?? ''],
    queryData: { params: { organizationId: organizationId ?? '' } },
    enabled: Boolean(organizationId),
    refetchInterval: false,
  });

  const sheetProjectId = nextActionFor?.project.id ?? statusFor?.project.id ?? '';
  const openTasksQuery = tsrProjects.listOpenTasks.useQuery({
    queryKey: ['tasks', 'project', sheetProjectId],
    queryData: {
      params: { id: sheetProjectId },
      query: { limit: PILE_SAFETY_CAP },
    },
    enabled: sheetProjectId.length > 0,
  });

  if (isBlockingQueryFailure(reviewQuery.error, reviewQuery.data) && reviewQuery.error) {
    return <ErrorState error={reviewQuery.error} onRetry={() => reviewQuery.refetch()} />;
  }

  const reviewProjects = reviewQuery.data?.status === 200 ? reviewQuery.data.body.projects : [];
  const today = reviewQuery.data?.status === 200 ? reviewQuery.data.body.today : '';
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
  const attentionCount = reviewAttentionCount(reviewProjects);
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
      data-review-version={ready ? version : undefined}
      className="container mx-auto max-w-2xl p-4"
    >
      <Header />
      <PlaceHeading
        title="Review"
        subcopy={reviewQuery.isPending ? 'Loading…' : reviewSubcopy(attentionCount)}
        subcopyTestId="review-subcopy"
      />

      {ready && reviewProjects.length === 0 ? (
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
                onSetNextAction={setNextActionFor}
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
                onSetNextAction={setNextActionFor}
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

      <ReviewDoneThisWeekSlot />

      <ReviewAllProjects
        projects={allProjects}
        onNewProject={() => setCreateOpen(true)}
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
          actions.setNextAction({ project: nextActionFor.project, body: { taskId } });
          closeNextAction();
        }}
        onCreateTask={(newTask) => {
          if (!nextActionFor) {
            return;
          }
          actions.setNextAction({ project: nextActionFor.project, body: { newTask } });
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
