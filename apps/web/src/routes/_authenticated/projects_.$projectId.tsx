import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, CircleCheck, Clock, History, Pencil } from 'lucide-react';
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
import { ConfirmProposalSheet } from '@/components/confirm-proposal-sheet';
import { PlaceHeading } from '@/components/place-heading';
import { ProjectStatusControl } from '@/components/project-status-control';
import { EditProjectDialog } from '@/components/edit-project-dialog';
import { ProjectNotesSection } from '@/components/project-notes-section';
import { ProposalBanner } from '@/components/proposal-banner';
import { NextActionPicker, type NewNextActionTask } from '@/components/next-action-picker';
import {
  authClient,
  captureClient,
  httpFailureMessage,
  httpStatusOf,
  isNetworkFailure,
  listClient,
  organizationClient,
  projectClient,
  taskClient,
} from '@/api/client';
import { memberLabel } from '@/api/auth';
import { PILE_SAFETY_CAP, type Task } from '@yoink/api-contracts';
import { invalidateLiveQueries, isBlockingQueryFailure } from '@/lib/live-query';
import { useOpenTaskMutations } from '@/lib/use-open-task-mutations';
import { localDateString, waitingLineParts } from '@/lib/format-waiting-line';
import { proposerLabel } from '@/lib/proposal-copy';
import { showsNoNextActionWarning, showsSomedaySetNextAction } from '@/lib/project-next-action';
import { useProposalActions } from '@/lib/use-proposal-actions';
import {
  formatFinishedLine,
  formatHistoryStartsLine,
  formatTimelineLine,
  formatTimelineStamp,
  shouldShowHistoryStartLine,
  visibleWebTimelineEntries,
} from '@/lib/format-timeline-entry';
import {
  useProjectFinishedPages,
  useProjectHistoryPages,
} from '@/lib/use-project-history-pages';
import { toast } from 'sonner';
import type { AssignableProjectStatus } from '@yoink/api-contracts';

export const Route = createFileRoute('/_authenticated/projects_/$projectId')({
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => projectClient.get({ id: projectId }),
  });

  const {
    data: openTasksData,
    error: openTasksError,
    isPending: openTasksPending,
    refetch: refetchOpenTasks,
  } = useQuery({
    queryKey: ['tasks', 'project', projectId],
    queryFn: () => projectClient.listOpenTasks({ id: projectId, limit: PILE_SAFETY_CAP }),
  });

  const { data: listsData } = useQuery({
    queryKey: ['lists'],
    queryFn: () => listClient.list({ limit: PILE_SAFETY_CAP }),
    refetchInterval: false,
  });
  const namedLists = listsData?.lists ?? [];

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectClient.list({ limit: PILE_SAFETY_CAP }),
    refetchInterval: false,
  });
  const projects = projectsData?.projects ?? [];

  const { data: sessionData } = useQuery({
    queryKey: ['session'],
    queryFn: () => authClient.session(),
    refetchInterval: false,
  });
  const organizationId = sessionData?.organizationId;
  const viewerId = sessionData?.user.id;

  const membersQuery = useQuery({
    queryKey: ['organization-members', organizationId ?? ''],
    queryFn: () => organizationClient.listMembers({ organizationId: organizationId ?? '' }),
    enabled: Boolean(organizationId),
    refetchInterval: false,
  });
  const members = membersQuery.data?.members ?? [];
  const viewerEmail = sessionData?.user.email;
  const restoredByName = proposerLabel(
    members.find((member) => member.userId === viewerId) ??
      (viewerEmail ? { kind: 'human', email: viewerEmail } : undefined)
  );
  const proposalActions = useProposalActions(restoredByName, {
    onDeclined: () => {
      void navigate({ to: '/process' });
    },
  });

  const project = data ?? undefined;
  const openTasks = openTasksData?.tasks ?? [];
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

  const { data: sourceCaptureData, isPending: isLoadingCapture } = useQuery({
    queryKey: ['capture', editingTask?.captureId ?? ''],
    queryFn: () => captureClient.get({ id: editingTask?.captureId ?? '' }),
    enabled: !!editingTask?.captureId,
    refetchInterval: false,
  });
  const sourceCapture = sourceCaptureData ?? null;

  useEffect(() => {
    if (editingTask) {
      void membersQuery.refetch();
    }
  }, [editingTask, membersQuery.refetch]);

  const statusMutation = useMutation({
    mutationFn: (input: Parameters<typeof projectClient.changeStatus>[0]) =>
      projectClient.changeStatus(input),
    onSuccess: async () => {
      setStatusError(null);
      toast.success('Project status saved');
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['review'] });
    },
    onError: (err) => {
      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      const status = httpStatusOf(err);
      if (status === 400 || status === 403 || status === 409) {
        const message = httpFailureMessage(err);
        if (message !== undefined) {
          setStatusError(message);
          return;
        }
      }
      toast.error('Failed to change project status');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: Parameters<typeof projectClient.update>[0]) => projectClient.update(input),
    onSuccess: async () => {
      setFormError(null);
      setEditOpen(false);
      toast.success('Project saved');
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => {
      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      const status = httpStatusOf(err);
      if (status === 400 || status === 409) {
        const message = httpFailureMessage(err);
        if (message !== undefined) {
          setFormError(message);
          return;
        }
      }
      toast.error('Failed to save project');
    },
  });

  const nextActionMutation = useMutation({
    mutationFn: (input: Parameters<typeof projectClient.setNextAction>[0]) =>
      projectClient.setNextAction(input),
    onSuccess: async () => {
      setNextActionError(null);
      setPickerOpen(false);
      toast.success('Next action saved');
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['review'] });
    },
    onError: (err) => {
      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      const status = httpStatusOf(err);
      if (status === 400 || status === 404) {
        const message = httpFailureMessage(err);
        if (message !== undefined) {
          setNextActionError(message);
          return;
        }
      }
      toast.error('Failed to set next action');
    },
  });

  const uncompleteMutation = useMutation({
    mutationFn: (input: Parameters<typeof taskClient.uncomplete>[0]) =>
      taskClient.uncomplete(input),
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

  const finishedByName = (task: Task): string => task.completedByName ?? 'Unknown';

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
      id: taskId,
      body: updates,
    });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate({ id });
    setDeleteConfirmId(null);
  };

  const submitNextAction = (body: { taskId: string } | { newTask: NewNextActionTask }) => {
    setNextActionError(null);
    nextActionMutation.mutate({
      id: projectId,
      ...body,
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
    <div className="container mx-auto max-w-2xl p-4 pb-12 md:pb-4">
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
            project.status === 'proposed' ? undefined : (
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
                    id: projectId,
                    ...input,
                  });
                }}
              />
            )
          }
          action={
            project.status === 'proposed' ? undefined : (
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
            )
          }
        />

        {project.status === 'proposed' ? (
          <ProposalBanner
            project={project}
            proposerName={proposerLabel(
              members.find((member) => member.userId === project.createdById)
            )}
            onConfirm={() => proposalActions.openConfirm(project)}
            onTurnDown={() => proposalActions.handleTurnDown(project)}
            disabled={proposalActions.isBusy}
          />
        ) : null}

        {project.objective ? (
          <p data-part="objective" className="text-base leading-6">
            {project.objective}
          </p>
        ) : project.status === 'proposed' ? null : (
          <Button
            type="button"
            variant="link"
            data-part="objective-empty"
            className="flex h-auto w-fit px-0 text-muted-foreground"
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
              onComplete={(id) => completeMutation.mutate({ id })}
              onUncomplete={(id) => uncompleteMutation.mutate({ id })}
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
            className="flex h-auto w-fit px-0 text-muted-foreground"
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

        <ProjectNotesSection projectId={projectId} />

        {project.notebookPages.length > 0 ? (
          <section data-project-notebook="" className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Notebook links
            </h2>
            <ul className="space-y-2">
              {project.notebookPages.map((page, index) => (
                <li key={page.path} data-project-notebook-page={index} className="text-sm">
                  <a
                    href={page.url}
                    className="font-medium underline underline-offset-2"
                  >
                    {page.path.split('/').at(-1) ?? page.path}
                  </a>
                  <span className="ml-2 text-muted-foreground">{page.path}</span>
                </li>
              ))}
            </ul>
          </section>
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
                  onComplete={(id) => completeMutation.mutate({ id })}
                  onUncomplete={(id) => uncompleteMutation.mutate({ id })}
                  onEdit={setEditingTask}
                  isLoading={taskBusy}
                  assigneeLabel={assigneeLabelFor(task)}
                />
              ))}
            </div>
          )}
        </section>

        <section data-project-finished="" className="space-y-2">
          <div className="rounded-xl border border-border bg-muted">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left"
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
              <div className="space-y-2 border-t border-border px-4 py-3">
                {finished.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No finished tasks</p>
                ) : (
                  finished.items.map((task) => (
                    <div
                      key={task.id}
                      data-project-finished-item={task.id}
                      data-task-title={task.title}
                      className="flex items-center gap-2 text-sm text-foreground"
                    >
                      <button
                        type="button"
                        data-slot="task-complete"
                        className="shrink-0 text-muted-foreground"
                        aria-label={`Reopen ${task.title}`}
                        disabled={taskBusy}
                        onClick={() =>
                          uncompleteMutation.mutate({ id: task.id })
                        }
                      >
                        <CircleCheck className="size-4" aria-hidden="true" />
                      </button>
                      <p data-finished-by="" className="min-w-0">
                        {task.completedAt
                          ? formatFinishedLine({
                              title: task.title,
                              name: finishedByName(task),
                              completedAt: task.completedAt,
                            })
                          : task.title}
                      </p>
                    </div>
                  ))
                )}
                {finished.hasNextPage ? (
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      data-project-finished-more=""
                      onClick={() => void finished.fetchNextPage()}
                      disabled={finished.isFetchingNextPage}
                    >
                      {finished.isFetchingNextPage ? 'Loading...' : 'Show more'}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <section data-project-history="" data-part="history" className="space-y-2">
          <div className="rounded-xl border border-border bg-muted">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left"
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
              <div className="space-y-2 border-t border-border px-4 py-3">
                {visibleWebTimelineEntries(history.entries).map((entry) => (
                  <div
                    key={entry.id}
                    data-project-history-entry={entry.id}
                    data-history-kind={entry.kind}
                    data-history-actor={entry.actor.name ?? 'Unknown'}
                    data-history-deleted={entry.subject.deleted ? 'true' : 'false'}
                    className="flex items-baseline gap-3 text-sm text-foreground"
                  >
                    <p className="min-w-0">
                      {formatTimelineLine(entry)}
                      {entry.subject.deleted ? (
                        <span className="ml-2 rounded border border-border px-1.5 text-[11px] font-medium lowercase text-muted-foreground">
                          deleted
                        </span>
                      ) : null}
                    </p>
                    <time className="shrink-0 text-muted-foreground">
                      {formatTimelineStamp(entry.occurredAt)}
                    </time>
                  </div>
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
                ) : shouldShowHistoryStartLine({
                    hasMore: history.hasMore,
                    createdAt: project.createdAt,
                    historyStartsAt: history.historyStartsAt,
                  }) ? (
                  <p
                    data-project-history-start=""
                    className="text-sm text-muted-foreground"
                  >
                    {formatHistoryStartsLine(history.historyStartsAt)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
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
            id: projectId,
            ...input,
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

      <ConfirmProposalSheet
        open={proposalActions.confirmOpen}
        onOpenChange={proposalActions.setConfirmOpen}
        project={proposalActions.activeProject}
        onConfirm={proposalActions.handleConfirm}
        isLoading={proposalActions.isBusy}
        error={proposalActions.confirmError}
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
