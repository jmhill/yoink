import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { Input } from '@yoink/ui-base/components/input';
import { Label } from '@yoink/ui-base/components/label';
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
import {
  cancelLiveQueries,
  invalidateLiveQueries,
  isBlockingQueryFailure,
  mapLiveOpenTaskLists,
  restoreQuerySnapshots,
  snapshotLiveOpenTaskLists,
} from '@/lib/live-query';
import { isFetchError } from '@ts-rest/react-query/v5';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/projects_/$projectId')({
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const queryClient = tsrProjects.useQueryClient();
  const { data, error, isPending, refetch } = tsrProjects.get.useQuery({
    queryKey: ['projects', projectId],
    queryData: { params: { id: projectId } },
    refetchInterval: false,
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

  const membersQuery = tsrOrganizations.listMembers.useQuery({
    queryKey: ['organization-members', organizationId ?? ''],
    queryData: { params: { organizationId: organizationId ?? '' } },
    enabled: Boolean(organizationId),
    refetchInterval: false,
  });
  const members = membersQuery.data?.status === 200 ? membersQuery.data.body.members : [];

  const project = data?.status === 200 ? data.body : undefined;
  const openTasks = openTasksData?.status === 200 ? openTasksData.body.tasks : [];
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: sourceCaptureData, isPending: isLoadingCapture } = tsr.get.useQuery({
    queryKey: ['capture', editingTask?.captureId ?? ''],
    queryData: { params: { id: editingTask?.captureId ?? '' } },
    enabled: !!editingTask?.captureId,
    refetchInterval: false,
  });
  const sourceCapture = sourceCaptureData?.status === 200 ? sourceCaptureData.body : null;

  useEffect(() => {
    if (!project) {
      return;
    }
    setName(project.name);
    setObjective(project.objective ?? '');
  }, [project]);

  useEffect(() => {
    if (editingTask) {
      void membersQuery.refetch();
    }
  }, [editingTask, membersQuery.refetch]);

  const updateMutation = tsrProjects.update.useMutation({
    onSuccess: async (result) => {
      if (result.status !== 200) return;
      setFormError(null);
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

  const completeMutation = tsrTasks.complete.useMutation({
    onMutate: async ({ params }) => {
      await cancelLiveQueries(queryClient);
      const previous = snapshotLiveOpenTaskLists(queryClient);
      mapLiveOpenTaskLists(queryClient, (tasks) =>
        tasks.filter((task) => task.id !== params.id)
      );
      return { previous };
    },
    onError: (err, _variables, context) => {
      if (context?.previous) {
        restoreQuerySnapshots(queryClient, context.previous);
      }
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to complete task');
      }
    },
    onSuccess: () => {
      toast.success('Task completed');
    },
    onSettled: () => {
      void invalidateLiveQueries(queryClient);
    },
  });

  const uncompleteMutation = tsrTasks.uncomplete.useMutation({
    onSettled: () => {
      void invalidateLiveQueries(queryClient);
    },
  });

  const deleteMutation = tsrTasks.delete.useMutation({
    onMutate: async ({ params }) => {
      await cancelLiveQueries(queryClient);
      const previous = snapshotLiveOpenTaskLists(queryClient);
      mapLiveOpenTaskLists(queryClient, (tasks) =>
        tasks.filter((task) => task.id !== params.id)
      );
      return { previous };
    },
    onError: (err, _variables, context) => {
      if (context?.previous) {
        restoreQuerySnapshots(queryClient, context.previous);
      }
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to delete task');
      }
    },
    onSuccess: () => {
      toast.success('Task deleted');
    },
    onSettled: () => {
      void invalidateLiveQueries(queryClient);
    },
  });

  const updateTaskMutation = tsrTasks.update.useMutation({
    onMutate: async ({ params, body }) => {
      await cancelLiveQueries(queryClient);
      const previous = snapshotLiveOpenTaskLists(queryClient);
      mapLiveOpenTaskLists(queryClient, (tasks, queryKey) =>
        tasks.flatMap((task) => {
          if (task.id !== params.id) {
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
        })
      );
      return { previous };
    },
    onError: (err, _variables, context) => {
      if (context?.previous) {
        restoreQuerySnapshots(queryClient, context.previous);
      }
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to update task');
      }
    },
    onSuccess: () => {
      toast.success('Task updated');
      setEditingTask(null);
    },
    onSettled: () => {
      void invalidateLiveQueries(queryClient);
    },
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

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || updateMutation.isPending) {
      if (!trimmedName) {
        setFormError('Name is required');
      }
      return;
    }
    updateMutation.mutate({
      params: { id: projectId },
      body: {
        name: trimmedName,
        objective: objective.trim() === '' ? null : objective.trim(),
      },
    });
  };

  const assigneeLabelFor = (task: Task): string | undefined => {
    if (!task.assigneeId) return undefined;
    const member = members.find((item) => item.userId === task.assigneeId);
    return member ? memberLabel(member) : task.assigneeId;
  };

  const listLabelFor = (task: Task): string | undefined => {
    if (!task.listId) return undefined;
    return namedLists.find((list) => list.id === task.listId)?.name;
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

  const tasksBlocking = isBlockingQueryFailure(openTasksError, openTasksData) && openTasksError;

  return (
    <div className="container mx-auto max-w-2xl p-4">
      <Header />
      <form data-project-page="" onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="project-page-name">Name</Label>
          <Input
            id="project-page-name"
            data-project-name-input=""
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setFormError(null);
            }}
            maxLength={200}
            disabled={updateMutation.isPending}
          />
        </div>

        <p data-project-status={project.status} className="text-sm capitalize text-muted-foreground">
          Status: {project.status}
        </p>

        <div className="space-y-2">
          <Label htmlFor="project-page-objective">Objective</Label>
          <textarea
            id="project-page-objective"
            data-project-objective-input=""
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            maxLength={2000}
            rows={5}
            disabled={updateMutation.isPending}
            className="border-input dark:bg-input/30 w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
        </div>

        {formError ? (
          <p role="alert" data-project-save-error="" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" data-project-save="" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link to="/projects">All projects</Link>
          </Button>
        </div>
      </form>

      <section className="mt-8 space-y-3" data-project-open-tasks="">
        <h2 className="text-lg font-semibold">Open tasks</h2>
        <p className="text-sm text-muted-foreground" data-project-open-task-count="">
          {openTasksPending
            ? 'Loading…'
            : `${openTasks.length} open task${openTasks.length === 1 ? '' : 's'}`}
        </p>
        {tasksBlocking ? (
          <ErrorState error={openTasksError} onRetry={() => refetchOpenTasks()} />
        ) : openTasks.length === 0 && !openTasksPending ? (
          <p data-project-open-tasks-empty="" className="text-sm text-muted-foreground">
            No open tasks
          </p>
        ) : (
          <div className="space-y-2">
            {openTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onComplete={(id) => completeMutation.mutate({ params: { id }, body: {} })}
                onUncomplete={(id) => uncompleteMutation.mutate({ params: { id }, body: {} })}
                onEdit={setEditingTask}
                isLoading={
                  completeMutation.isPending ||
                  updateTaskMutation.isPending ||
                  deleteMutation.isPending
                }
                assigneeLabel={assigneeLabelFor(task)}
                listLabel={listLabelFor(task)}
              />
            ))}
          </div>
        )}
      </section>

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
