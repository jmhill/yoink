import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, Clock, History, Pencil } from 'lucide-react';
import { Button } from '@yoink/ui-base/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@yoink/ui-base/components/dialog';
import { Header } from '@/components/header';
import { ErrorState } from '@/components/error-state';
import { TaskCard } from '@/components/task-card';
import { TaskEditModal } from '@/components/task-edit-modal';
import { PlaceHeading } from '@/components/place-heading';
import { ProjectStatusControl } from '@/components/project-status-control';
import { EditProjectDialog } from '@/components/edit-project-dialog';
import { NextActionPicker, type NewNextActionTask } from '@/components/next-action-picker';
import {
  tsr,
  tsrAuth,
  tsrLists,
  tsrOrganizations,
  tsrProjects,
  tsrTasks,
} from '@/api/client';
import { memberLabel } from '@/api/auth';
import { PILE_SAFETY_CAP, projectContract, type Task } from '@yoink/api-contracts';
import { invalidateLiveQueries, isBlockingQueryFailure } from '@/lib/live-query';
import { useOpenTaskMutations } from '@/lib/use-open-task-mutations';
import { localDateString, waitingLineParts } from '@/lib/format-waiting-line';
import { showsNoNextActionWarning, showsSomedaySetNextAction } from '@/lib/project-next-action';
import {
  formatHistoryStartsLine,
  formatTimelineLine,
} from '@/lib/format-timeline-entry';
import {
  useProjectFinishedPages,
  useProjectHistoryPages,
} from '@/lib/use-project-history-pages';
import { isFetchError } from '@ts-rest/react-query/v5';
import { toast } from 'sonner';
import type { AssignableProjectStatus } from '@yoink/api-contracts';

export const Route = createFileRoute('/_authenticated/projects_/$projectId')({
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const queryClient = tsrProjects.useQueryClient();
  const { data, error, isPending, refetch } = tsrProjects.get.useQuery({
    queryKey: ['projects', projectId],
    queryData: { params: { id: projectId } },
  });

  const {
    data: openTasksData,
    error: openTasksError,
    isPending: openTasksPending,
    refetch: refetchOpenTasks,
  } = tsrProjects.listOpenTasks.useQuery({
    queryKey: ['tasks', 'project', projectId],
    queryData: { params: { id: projectId }, query: { limit: PILE_SAFETY_CAP } },
  });

  const { data: listsData } = tsrLists.list.useQuery({
    queryKey: ['lists'],
    queryData: { query: { limit: PILE_SAFETY_CAP } },
    refetchInterval: false,
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

  const membersQuery = tsrOrganizations.listMembers.useQuery({
    queryKey: ['organization-members', organizationId ?? ''],
    queryData: { params: { organizationId: organizationId ?? '' } },
    enabled: Boolean(organizationId),
    refetchInterval: false,
  });
  const members = membersQuery.data?.status === 200 ? membersQuery.data.body.members : [];

  const project = data?.status === 200 ? data.body : undefined;
  const openTasks = openTasksData?.status === 200 ? openTasksData.body.tasks : [];
  const [formError, setFormError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [nextActionError, setNextActionError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [waitingFormOpen, setWaitingFormOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [finishedOpen, setFinishedOpen] = useState(false);
  const history = useProjectHistoryPages(projectId, true);
  const finished = useProjectFinishedPages(projectId, true);

  const { data: sourceCaptureData, isPending: isLoadingCapture } = tsr.get.useQuery({
    queryKey: ['capture', editingTask?.captureId ?? ''],
    queryData: { params: { id: editingTask?.captureId ?? '' } },
    enabled: !!editingTask?.captureId,
    refetchInterval: false,
  });
  const sourceCapture = sourceCaptureData?.status === 200 ? sourceCaptureData.body : null;

  useEffect(() => {
    if (editingTask) {
      void membersQuery.refetch();
    }
  }, [editingTask, membersQuery.refetch]);

  const statusMutation = tsrProjects.changeStatus.useMutation({
    onSuccess: async (result) => {
      if (result.status !== 200) return;
      setStatusError(null);
      toast.success('Project status saved');
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      if (typeof err === 'object' && err !== null && 'status' in err && 'body' in err) {
        const status = err.status;
        if (status === 400 || status === 403 || status === 409) {
          const parsed = projectContract.changeStatus.responses[status].safeParse(err.body);
          if (parsed.success) {
            setStatusError(parsed.data.message);
            return;
          }
        }
      }
      toast.error('Failed to change project status');
    },
  });

  const updateMutation = tsrProjects.update.useMutation({
    onSuccess: async (result) => {
      if (result.status !== 200) return;
      setFormError(null);
      setEditOpen(false);
      toast.success('Project saved');
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      if (typeof err === 'object' && err !== null && 'status' in err && 'body' in err) {
        const status = err.status;
        if (status === 400 || status === 409) {
          const parsed = projectContract.update.responses[status].safeParse(err.body);
          if (parsed.success) {
            setFormError(parsed.data.message);
            return;
          }
        }
      }
      toast.error('Failed to save project');
    },
  });

  const nextActionMutation = tsrProjects.setNextAction.useMutation({
    onSuccess: async (result) => {
      if (result.status !== 200) return;
      setNextActionError(null);
      setPickerOpen(false);
      toast.success('Next action saved');
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      if (typeof err === 'object' && err !== null && 'status' in err && 'body' in err) {
        const status = err.status;
        if (status === 400 || status === 404) {
          const parsed = projectContract.setNextAction.responses[status].safeParse(err.body);
          if (parsed.success) {
            setNextActionError(parsed.data.message);
            return;
          }
        }
      }
      toast.error('Failed to set next action');
    },
  });

  const uncompleteMutation = tsrTasks.uncomplete.useMutation({
    onSettled: () => {
      void invalidateLiveQueries(queryClient);
    },
  });

  const { completeMutation, deleteMutation, updateMutation: updateTaskMutation } =
    useOpenTaskMutations(queryClient, {
      onUpdated: () => setEditingTask(null),
      mapUpdate: (tasks, queryKey, { id, body }) =>
        tasks.flatMap((task) => {
          if (task.id !== id) {
            return [task];
          }
          const nextProjectId =
            body?.projectId === null ? undefined : body?.projectId ?? task.projectId;
          const isThisProjectList =
            queryKey[0] === 'tasks' && queryKey[1] === 'project' && queryKey[2] === projectId;
          if (isThisProjectList && nextProjectId !== projectId) {
            return [];
          }
          return [
            {
              ...task,
              title: body?.title ?? task.title,
              dueDate: body?.dueDate === null ? undefined : body?.dueDate ?? task.dueDate,
              assigneeId:
                body?.assigneeId === null ? undefined : body?.assigneeId ?? task.assigneeId,
              listId: body?.listId === null ? undefined : body?.listId ?? task.listId,
              projectId: nextProjectId,
            },
          ];
        }),
    });

  if (isBlockingQueryFailure(error, data) && error) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  if (isPending || !project) {
    return (
      <div className="container mx-auto max-w-2xl p-4">
        <Header />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const assigneeLabelFor = (task: Task): string | undefined => {
    if (!task.assigneeId || task.assigneeId === viewerId) return undefined;
    const member = members.find((item) => item.userId === task.assigneeId);
    return member ? memberLabel(member) : task.assigneeId;
  };

  const handleSaveEdit = (
    taskId: string,
    updates: {
      title?: string;
      dueDate?: string | null;
      assigneeId?: string | null;
      listId?: string | null;
      projectId?: string | null;
    }
  ) => {
    updateTaskMutation.mutate({
      params: { id: taskId },
      body: updates,
    });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate({ params: { id } });
    setDeleteConfirmId(null);
  };

  const submitNextAction = (body: { taskId: string } | { newTask: NewNextActionTask }) => {
    setNextActionError(null);
    nextActionMutation.mutate({
      params: { id: projectId },
      body,
    });
  };

  const nextActionTask = openTasks.find((task) => task.id === project.nextActionTaskId);
  const otherOpenTasks = openTasks.filter((task) => task.id !== project.nextActionTaskId);
  const showEmptyCard = showsNoNextActionWarning(project);
  const showSomedaySetLink = showsSomedaySetNextAction(project);
  const waitingParts =
    project.status === 'waiting' && project.waitingOn
      ? waitingLineParts({
          waitingOn: project.waitingOn,
          waitingSince: project.waitingSince,
          today: localDateString(),
        })
      : null;
  const waitingDayLabel =
    waitingParts?.kind === 'known'
      ? waitingParts.days === 1
        ? '1 day'
        : `${waitingParts.days} days`
      : null;

  const tasksBlocking = isBlockingQueryFailure(openTasksError, openTasksData) && openTasksError;
  const taskBusy =
    completeMutation.isPending || updateTaskMutation.isPending || deleteMutation.isPending;

  return (
    <div className="container mx-auto max-w-2xl p-4">
      <Header />
      <div data-project-page="" className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
          <Link to="/projects" data-part="back-link">
            <ChevronLeft className="size-4" />
            All projects
          </Link>
        </Button>

        <PlaceHeading
          title={project.name}
          meta={
            <ProjectStatusControl
              project={project}
              openTaskCount={openTasks.length}
              isPending={statusMutation.isPending}
              error={statusError}
              waitingFormOpen={waitingFormOpen}
              onWaitingFormOpenChange={setWaitingFormOpen}
              onChangeStatus={(input: {
                status: AssignableProjectStatus;
                waitingOn?: string | null;
                waitingSince?: string | null;
                openTasks?: 'complete' | 'remove';
              }) => {
                setStatusError(null);
                statusMutation.mutate({
                  params: { id: projectId },
                  body: input,
                });
              }}
            />
          }
          action={
            <Button
              type="button"
              variant="outline"
              data-project-edit=""
              data-part="edit-button"
              onClick={() => {
                setFormError(null);
                setEditOpen(true);
              }}
            >
              <Pencil className="size-4" />
              Edit
            </Button>
          }
        />

        {project.objective ? (
          <p data-part="objective" className="text-base leading-6">
            {project.objective}
          </p>
        ) : (
          <Button
            type="button"
            variant="link"
            data-part="objective-empty"
            className="h-auto px-0 text-muted-foreground"
            onClick={() => {
              setFormError(null);
              setEditOpen(true);
            }}
          >
            + Add an objective
          </Button>
        )}

        {waitingParts ? (
          <button
            type="button"
            data-project-waiting-summary=""
            data-part="waiting-line"
            className="flex w-full items-center gap-2 rounded-lg border border-warning-border bg-warning-muted px-3 py-2 text-left text-sm text-warning"
            onClick={() => setWaitingFormOpen(true)}
          >
            <Clock className="size-4 shrink-0" aria-hidden="true" />
            <span>
              Waiting on <b>{waitingParts.who}</b>
              {waitingParts.kind === 'unknown'
                ? ' · since unknown'
                : ` since ${waitingParts.dateLabel} (${waitingDayLabel})`}
            </span>
          </button>
        ) : null}

        {nextActionTask ? (
          <section
            data-next-action-card=""
            data-part="next-action-card"
            className="rounded-xl border-2 border-primary bg-card p-4 shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide">
              <span>Next action</span>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs font-medium normal-case text-muted-foreground"
                data-set-next-action=""
                onClick={() => {
                  setNextActionError(null);
                  setPickerOpen(true);
                }}
              >
                Change
              </Button>
            </div>
            <TaskCard
              task={nextActionTask}
              emphasis="next-action"
              onComplete={(id) => completeMutation.mutate({ params: { id }, body: {} })}
              onUncomplete={(id) => uncompleteMutation.mutate({ params: { id }, body: {} })}
              onEdit={setEditingTask}
              isLoading={taskBusy}
              assigneeLabel={assigneeLabelFor(nextActionTask)}
            />
          </section>
        ) : showEmptyCard ? (
          <section
            data-next-action-empty=""
            data-part="next-action-empty"
            className="rounded-xl border-2 border-dashed border-warning-border bg-warning-muted p-4"
          >
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-warning">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
              No next action
            </p>
            <p className="mt-2 text-sm text-warning-foreground">
              This project won’t show up in Work until it has one. Pick an open task or add a
              new one.
            </p>
            <Button
              type="button"
              className="mt-3"
              data-set-next-action=""
              onClick={() => {
                setNextActionError(null);
                setPickerOpen(true);
              }}
            >
              + Set next action
            </Button>
          </section>
        ) : showSomedaySetLink ? (
          <Button
            type="button"
            variant="link"
            className="h-auto px-0 text-muted-foreground"
            data-set-next-action=""
            data-someday-set-next-action=""
            onClick={() => {
              setNextActionError(null);
              setPickerOpen(true);
            }}
          >
            Set next action
          </Button>
        ) : null}

        <section className="space-y-3" data-project-open-tasks="">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Open tasks</h2>
            <p className="text-sm text-muted-foreground" data-project-open-task-count="">
              {openTasksPending
                ? 'Loading…'
                : `${otherOpenTasks.length} open task${otherOpenTasks.length === 1 ? '' : 's'} · newest first`}
            </p>
          </div>
          {tasksBlocking ? (
            <ErrorState error={openTasksError} onRetry={() => refetchOpenTasks()} />
          ) : otherOpenTasks.length === 0 && !openTasksPending ? (
            <p data-project-open-tasks-empty="" className="text-sm text-muted-foreground">
              No open tasks
            </p>
          ) : (
            <div className="space-y-2">
              {otherOpenTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onComplete={(id) => completeMutation.mutate({ params: { id }, body: {} })}
                  onUncomplete={(id) => uncompleteMutation.mutate({ params: { id }, body: {} })}
                  onEdit={setEditingTask}
                  isLoading={taskBusy}
                  assigneeLabel={assigneeLabelFor(task)}
                />
              ))}
            </div>
          )}
        </section>

        <section data-project-finished="" className="space-y-2">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-xl border border-border bg-muted px-4 py-3 text-left"
            aria-expanded={finishedOpen}
            onClick={() => setFinishedOpen((open) => !open)}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Finished ({finished.total})
            </span>
            <ChevronDown
              className={`size-4 text-muted-foreground transition-transform ${finishedOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
          {finishedOpen ? (
            <div className="space-y-2 px-1">
              {finished.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No finished tasks</p>
              ) : (
                finished.items.map((task) => (
                  <div key={task.id} data-project-finished-item={task.id}>
                    <TaskCard
                      task={task}
                      onComplete={(id) => completeMutation.mutate({ params: { id }, body: {} })}
                      onUncomplete={(id) => uncompleteMutation.mutate({ params: { id }, body: {} })}
                      onEdit={setEditingTask}
                      isLoading={taskBusy}
                      assigneeLabel={assigneeLabelFor(task)}
                    />
                  </div>
                ))
              )}
              {finished.hasNextPage ? (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void finished.fetchNextPage()}
                    disabled={finished.isFetchingNextPage}
                  >
                    {finished.isFetchingNextPage ? 'Loading...' : 'Show more'}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section data-project-history="" data-part="history" className="space-y-2">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-xl border border-border bg-muted px-4 py-3 text-left"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <History className="size-4" aria-hidden="true" />
              History
            </span>
            <ChevronDown
              className={`size-4 text-muted-foreground transition-transform ${historyOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
          {historyOpen ? (
            <div className="space-y-2 px-1">
              {history.entries.map((entry) => (
                <p
                  key={entry.id}
                  data-project-history-entry={entry.id}
                  data-history-kind={entry.kind}
                  data-history-actor={entry.actor.name ?? 'Unknown'}
                  data-history-deleted={entry.subject.deleted ? 'true' : 'false'}
                  className="text-sm text-foreground"
                >
                  {formatTimelineLine(entry)}
                  {entry.subject.deleted ? (
                    <span className="ml-2 rounded border border-border px-1.5 text-[11px] font-medium lowercase text-muted-foreground">
                      deleted
                    </span>
                  ) : null}
                </p>
              ))}
              {history.hasMore ? (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    data-project-history-more=""
                    onClick={() => void history.fetchNextPage()}
                    disabled={history.isFetchingNextPage}
                  >
                    {history.isFetchingNextPage ? 'Loading...' : 'Show more'}
                  </Button>
                </div>
              ) : (
                <p
                  data-project-history-start=""
                  className="text-sm text-muted-foreground"
                >
                  {formatHistoryStartsLine(history.historyStartsAt)}
                </p>
              )}
            </div>
          ) : null}
        </section>
      </div>

      <EditProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
        isPending={updateMutation.isPending}
        error={formError}
        onClearError={() => setFormError(null)}
        onSave={(input) => {
          updateMutation.mutate({
            params: { id: projectId },
            body: input,
          });
        }}
      />

      <NextActionPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={nextActionTask ? 'Change next action' : 'Set next action'}
        description="Pick an open task or create a new one in this project."
        testId="next-action-picker"
        openTasks={openTasks}
        excludeTaskId={project.nextActionTaskId}
        lists={namedLists.map((list) => ({ id: list.id, name: list.name }))}
        members={members.map((member) => ({
          userId: member.userId,
          label: memberLabel(member),
        }))}
        isPending={nextActionMutation.isPending}
        error={nextActionError}
        onPickTask={(taskId) => submitNextAction({ taskId })}
        onCreateTask={(newTask) => submitNextAction({ newTask })}
      />

      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete task?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This task will be permanently deleted.
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

      <TaskEditModal
        open={editingTask !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingTask(null);
          }
        }}
        task={editingTask}
        sourceCapture={sourceCapture}
        onSave={handleSaveEdit}
        onDelete={(id) => {
          setEditingTask(null);
          setDeleteConfirmId(id);
        }}
        isLoading={updateTaskMutation.isPending}
        isLoadingCapture={isLoadingCapture}
        members={members.map((member) => ({ userId: member.userId, label: memberLabel(member) }))}
        lists={namedLists.map((list) => ({ id: list.id, name: list.name }))}
        projects={projects.map((item) => ({
          id: item.id,
          name: item.name,
          status: item.status,
        }))}
      />
    </div>
  );
}
