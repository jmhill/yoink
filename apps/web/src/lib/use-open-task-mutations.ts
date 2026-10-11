import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { isFetchError } from '@ts-rest/react-query/v5';
import { toast } from 'sonner';
import type { Task } from '@yoink/api-contracts';
import { tsrTasks } from '@/api/client';
import {
  cancelLiveQueries,
  invalidateLiveQueries,
  mapLiveOpenTaskLists,
  mapLiveProjects,
  projectsWithNextAction,
  restoreQuerySnapshots,
  snapshotLiveOpenTaskLists,
  snapshotLiveProjects,
} from '@/lib/live-query';
import { dismissWhatsNext, offerWhatsNext } from '@/lib/whats-next';
import {
  isTaskHistoryData,
  mapTaskHistoryPageItems,
} from '@/lib/use-history-pages';

export type UpdateTaskBody = {
  title?: string;
  dueDate?: string | null;
  assigneeId?: string | null;
  listId?: string | null;
  projectId?: string | null;
};

export type MapOpenTaskUpdate = (
  tasks: Task[],
  queryKey: QueryKey,
  input: { id: string; body?: UpdateTaskBody }
) => Task[];

/**
 * Shared complete / delete / edit mutations for Tasks and the project page.
 */
export const useOpenTaskMutations = (
  queryClient: QueryClient,
  options: {
    mapUpdate: MapOpenTaskUpdate;
    onUpdated?: () => void;
  }
) => {
  const completeMutation = tsrTasks.complete.useMutation({
    onMutate: async ({ params }) => {
      await cancelLiveQueries(queryClient);
      const previous = snapshotLiveOpenTaskLists(queryClient);
      const previousProjects = snapshotLiveProjects(queryClient);
      const nextActionProjects = projectsWithNextAction(queryClient, params.id);
      mapLiveOpenTaskLists(queryClient, (tasks) =>
        tasks.filter((task) => task.id !== params.id)
      );
      mapLiveProjects(queryClient, (project) =>
        project.nextActionTaskId === params.id
          ? { ...project, nextActionTaskId: null }
          : project
      );
      const nextActionProject = nextActionProjects[0];
      if (nextActionProject) {
        offerWhatsNext({
          projectId: nextActionProject.id,
          projectName: nextActionProject.name,
          completedTaskId: params.id,
        });
      }
      return { previous, previousProjects };
    },
    onError: (err, _variables, context) => {
      if (context?.previous) {
        restoreQuerySnapshots(queryClient, context.previous);
      }
      if (context?.previousProjects) {
        restoreQuerySnapshots(queryClient, context.previousProjects);
      }
      dismissWhatsNext();
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

  const deleteMutation = tsrTasks.delete.useMutation({
    onMutate: async ({ params }) => {
      await cancelLiveQueries(queryClient);
      const previous = snapshotLiveOpenTaskLists(queryClient);
      const previousProjects = snapshotLiveProjects(queryClient);
      const completedKey = ['tasks', 'completed'] as const;
      const previousCompleted = queryClient.getQueryData(completedKey);
      mapLiveOpenTaskLists(queryClient, (tasks) =>
        tasks.filter((task) => task.id !== params.id)
      );
      mapLiveProjects(queryClient, (project) =>
        project.nextActionTaskId === params.id
          ? { ...project, nextActionTaskId: null }
          : project
      );
      if (isTaskHistoryData(previousCompleted)) {
        queryClient.setQueryData(
          completedKey,
          mapTaskHistoryPageItems(previousCompleted, (items) =>
            items.filter((task) => task.id !== params.id)
          )
        );
      }
      return { previous, previousProjects, previousCompleted, completedKey };
    },
    onError: (err, _variables, context) => {
      if (context?.previous) {
        restoreQuerySnapshots(queryClient, context.previous);
      }
      if (context?.previousProjects) {
        restoreQuerySnapshots(queryClient, context.previousProjects);
      }
      if (context?.completedKey) {
        queryClient.setQueryData(context.completedKey, context.previousCompleted);
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

  const updateMutation = tsrTasks.update.useMutation({
    onMutate: async ({ params, body }) => {
      await cancelLiveQueries(queryClient);
      const previous = snapshotLiveOpenTaskLists(queryClient);
      const previousProjects = snapshotLiveProjects(queryClient);
      mapLiveOpenTaskLists(queryClient, (tasks, queryKey) =>
        options.mapUpdate(tasks, queryKey, { id: params.id, body })
      );
      const leavingProject =
        body?.projectId === null ||
        (typeof body?.projectId === 'string' && body.projectId.length > 0);
      if (leavingProject) {
        mapLiveProjects(queryClient, (project) => {
          if (project.nextActionTaskId !== params.id) {
            return project;
          }
          if (body.projectId === project.id) {
            return project;
          }
          return { ...project, nextActionTaskId: null };
        });
      }
      return { previous, previousProjects };
    },
    onError: (err, _variables, context) => {
      if (context?.previous) {
        restoreQuerySnapshots(queryClient, context.previous);
      }
      if (context?.previousProjects) {
        restoreQuerySnapshots(queryClient, context.previousProjects);
      }
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to update task');
      }
    },
    onSuccess: () => {
      toast.success('Task updated');
      options.onUpdated?.();
    },
    onSettled: () => {
      void invalidateLiveQueries(queryClient);
    },
  });

  return { completeMutation, deleteMutation, updateMutation };
};
