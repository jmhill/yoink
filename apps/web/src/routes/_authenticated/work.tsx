import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { User } from 'lucide-react';
import { Button } from '@yoink/ui-base/components/button';
import { Card, CardContent } from '@yoink/ui-base/components/card';
import { PILE_SAFETY_CAP, type Task } from '@yoink/api-contracts';
import { memberLabel } from '@/api/auth';
import { tsr, tsrAuth, tsrLists, tsrOrganizations, tsrProjects, tsrWork } from '@/api/client';
import { Header } from '@/components/header';
import { MobileTasksRailDrawer } from '@/components/mobile-tasks-rail-drawer';
import { NowListsSheet } from '@/components/now-lists-sheet';
import { NowSection } from '@/components/now-section';
import { PlaceHeading } from '@/components/place-heading';
import { ErrorState } from '@/components/error-state';
import { TaskEditModal } from '@/components/task-edit-modal';
import { isBlockingQueryFailure } from '@/lib/live-query';
import { listsRowLabel, localDateLabel, nowSubcopy, ownerLabelFor } from '@/lib/now';
import { useOpenTaskMutations } from '@/lib/use-open-task-mutations';
import { TASK_SURFACE_TEST_ID } from '@/lib/inbox-pane';
import { calendarDateInTimeZone, viewerTimeZone } from '@/lib/viewer-today';
import { workScreenSectionCopy, workScreenSections } from '@/lib/work-screen';

const searchSchema = z.object({
  mine: z.boolean().optional(),
});

export const Route = createFileRoute('/_authenticated/work')({
  validateSearch: searchSchema,
  component: WorkPage,
});

function WorkPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const mine = search.mine === true;
  const owner = mine ? 'me' : 'all';
  const timeZone = viewerTimeZone();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [listsOpen, setListsOpen] = useState(false);

  const { data: sessionData } = tsrAuth.session.useQuery({
    queryKey: ['session'],
    queryData: {},
    refetchInterval: false,
  });
  const organizationId = sessionData?.status === 200 ? sessionData.body.organizationId : undefined;
  const currentUserId = sessionData?.status === 200 ? sessionData.body.user.id : undefined;

  const membersQuery = tsrOrganizations.listMembers.useQuery({
    queryKey: ['organization-members', organizationId ?? ''],
    queryData: { params: { organizationId: organizationId ?? '' } },
    enabled: Boolean(organizationId),
    refetchInterval: false,
  });
  const members = membersQuery.data?.status === 200 ? membersQuery.data.body.members : [];

  const nextActionsQuery = tsrWork.listNextActions.useQuery({
    queryKey: ['work', 'next-actions', owner],
    queryData: { query: { owner, limit: PILE_SAFETY_CAP } },
  });
  const dueQuery = tsrWork.listDue.useQuery({
    queryKey: ['work', 'due', owner],
    queryData: { query: { owner, limit: PILE_SAFETY_CAP, timeZone } },
  });
  const listsQuery = tsrWork.listLists.useQuery({
    queryKey: ['work', 'lists'],
    queryData: { query: { limit: PILE_SAFETY_CAP } },
  });
  const namedListsQuery = tsrLists.list.useQuery({
    queryKey: ['lists'],
    queryData: { query: { limit: PILE_SAFETY_CAP } },
  });
  const projectsQuery = tsrProjects.list.useQuery({
    queryKey: ['projects'],
    queryData: { query: { limit: PILE_SAFETY_CAP } },
    refetchInterval: false,
  });
  const { data: sourceCaptureData, isPending: isLoadingCapture } = tsr.get.useQuery({
    queryKey: ['capture', editingTask?.captureId ?? ''],
    queryData: { params: { id: editingTask?.captureId ?? '' } },
    enabled: Boolean(editingTask?.captureId),
    refetchInterval: false,
  });
  const sourceCapture = sourceCaptureData?.status === 200 ? sourceCaptureData.body : null;

  const queryClient = tsrWork.useQueryClient();
  const { completeMutation, deleteMutation, updateMutation } = useOpenTaskMutations(queryClient, {
    mapUpdate: (tasks, _queryKey, input) =>
      tasks.map((task) =>
        task.id === input.id
          ? {
              ...task,
              ...(input.body?.title !== undefined ? { title: input.body.title } : {}),
              ...(input.body?.dueDate !== undefined
                ? { dueDate: input.body.dueDate ?? undefined }
                : {}),
              ...(input.body?.assigneeId !== undefined
                ? { assigneeId: input.body.assigneeId ?? undefined }
                : {}),
            }
          : task
      ),
  });

  const nextActions =
    nextActionsQuery.data?.status === 200 ? nextActionsQuery.data.body.items : [];
  const dueTasks = dueQuery.data?.status === 200 ? dueQuery.data.body.tasks : [];
  const nextActionCount =
    nextActionsQuery.data?.status === 200 ? nextActionsQuery.data.body.total : nextActions.length;
  const dueCount = dueQuery.data?.status === 200 ? dueQuery.data.body.total : dueTasks.length;
  const namedLists = listsQuery.data?.status === 200 ? listsQuery.data.body.lists : [];
  const unlistedCount =
    listsQuery.data?.status === 200 ? listsQuery.data.body.unlisted.openTaskCount : 0;
  const editLists = namedListsQuery.data?.status === 200 ? namedListsQuery.data.body.lists : [];
  const editProjects = projectsQuery.data?.status === 200 ? projectsQuery.data.body.projects : [];

  const ready =
    nextActionsQuery.isSuccess &&
    dueQuery.isSuccess &&
    nextActionsQuery.data !== undefined &&
    dueQuery.data !== undefined;

  const isPending = nextActionsQuery.isPending || dueQuery.isPending;
  const queryError = nextActionsQuery.error ?? dueQuery.error;
  const blockingError = isBlockingQueryFailure(queryError, nextActionsQuery.data ?? dueQuery.data)
    ? queryError
    : null;

  const ownerOf = (task: Task) => ownerLabelFor(task, currentUserId, members);
  const today = calendarDateInTimeZone(new Date(), timeZone);
  const sections = workScreenSections({ nextActions, dueTasks, today });

  const bothEmpty = ready && nextActions.length === 0 && dueTasks.length === 0;

  return (
    <div
      data-testid={TASK_SURFACE_TEST_ID}
      data-task-surface=""
      data-now-ready={ready ? '' : undefined}
      data-now-owner={ready ? owner : undefined}
      className="container mx-auto max-w-2xl bg-background p-4"
    >
      <Header leading={<MobileTasksRailDrawer />} />
      <PlaceHeading
        title="Work"
        subcopy={nowSubcopy({
          localDate: localDateLabel(new Date(), timeZone),
          nextActionCount,
          dueCount,
        })}
        subcopyTestId="now-subcopy"
        action={
          <Button
            type="button"
            variant={mine ? 'default' : 'outline'}
            aria-pressed={mine}
            data-now-mine-toggle=""
            className={mine ? 'shadow-sm' : undefined}
            onClick={() => {
              void navigate({
                to: '/work',
                search: mine ? {} : { mine: true },
              });
            }}
          >
            <User className="h-4 w-4" />
            Mine
          </Button>
        }
      />

      {blockingError ? (
        <ErrorState
          error={blockingError}
          onRetry={() => {
            void nextActionsQuery.refetch();
            void dueQuery.refetch();
          }}
        />
      ) : isPending ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : bothEmpty ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>Nothing in Now</p>
            <p className="text-sm">Active next actions and due work will show up here</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => {
            const copy = workScreenSectionCopy(section.name);
            return (
              <NowSection
                key={section.name}
                name={section.name}
                title={copy.title}
                emptyMessage={copy.emptyMessage}
                rows={section.rows.map((row) => ({
                  task: row.task,
                  projectLabel: row.projectLabel,
                  ownerLabel: ownerOf(row.task),
                }))}
                onComplete={(id) => completeMutation.mutate({ params: { id }, body: {} })}
                onEdit={setEditingTask}
                isLoading={completeMutation.isPending}
              />
            );
          })}
        </div>
      )}

      <button
        type="button"
        data-now-lists-row=""
        className="mt-8 flex w-full items-center justify-between rounded-md border border-border px-3 py-3 text-left text-sm md:hidden"
        onClick={() => setListsOpen(true)}
      >
        <span>Lists</span>
        <span className="text-muted-foreground">{listsRowLabel(namedLists.length)}</span>
      </button>

      <NowListsSheet
        open={listsOpen}
        onOpenChange={setListsOpen}
        lists={namedLists}
        unlistedCount={unlistedCount}
      />

      <TaskEditModal
        open={editingTask !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingTask(null);
          }
        }}
        task={editingTask}
        sourceCapture={sourceCapture}
        onSave={(taskId, updates) =>
          updateMutation.mutate({ params: { id: taskId }, body: updates })
        }
        onDelete={(id) => {
          setEditingTask(null);
          deleteMutation.mutate({ params: { id } });
        }}
        isLoading={updateMutation.isPending}
        isLoadingCapture={isLoadingCapture}
        members={members.map((member) => ({ userId: member.userId, label: memberLabel(member) }))}
        lists={editLists.map((list) => ({ id: list.id, name: list.name }))}
        projects={editProjects.map((project) => ({
          id: project.id,
          name: project.name,
          status: project.status,
        }))}
      />
    </div>
  );
}
