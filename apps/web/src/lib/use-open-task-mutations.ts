import { useMutation, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Task } from '@yoink/api-contracts';
import { isNetworkFailure, taskClient } from '@/api/client';
import {
  cancelLiveQueries,
  invalidateLiveQueries,
  mapLiveNowSections,
  mapLiveOpenTaskLists,
  mapLiveProjects,
  projectsWithNextAction,
  restoreQuerySnapshots,
  snapshotLiveNowSections,
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
  const completeMutation = useMutation({
    mutationFn: (input: { id: string }) => taskClient.complete(input),
    onMutate: async ({ id }) => {
      await cancelLiveQueries(queryClient);
      const previous = snapshotLiveOpenTaskLists(queryClient);
      const previousProjects = snapshotLiveProjects(queryClient);
      const previousNow = snapshotLiveNowSections(queryClient);
      const nextActionProjects = projectsWithNextAction(queryClient, id);
      mapLiveOpenTaskLists(queryClient, (tasks) =>
        tasks.filter((task) => task.id !== id)
      );
      mapLiveNowSections(queryClient, id);
      mapLiveProjects(queryClient, (project) =>
        project.nextActionTaskId === id
          ? { ...project, nextActionTaskId: null }
          : project
      );
      const nextActionProject = nextActionProjects[0];
      if (nextActionProject) {
        offerWhatsNext({
          projectId: nextActionProject.id,
          projectName: nextActionProject.name,
          completedTaskId: id,
        });
      }
      return { previous, previousProjects, previousNow };
    },
    onError: (err, _variables, context) => {
      if (context?.previous) {
        restoreQuerySnapshots(queryClient, context.previous);
      }
      if (context?.previousProjects) {
        restoreQuerySnapshots(queryClient, context.previousProjects);
      }
      if (context?.previousNow) {
        restoreQuerySnapshots(queryClient, context.previousNow);
      }
      dismissWhatsNext();
      if (isNetworkFailure(err)) {
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

  const deleteMutation = useMutation({
    mutationFn: (input: { id: string }) => taskClient.delete(input),
    onMutate: async ({ id }) => {
      await cancelLiveQueries(queryClient);
      const previous = snapshotLiveOpenTaskLists(queryClient);
      const previousProjects = snapshotLiveProjects(queryClient);
      const previousNow = snapshotLiveNowSections(queryClient);
      const completedKey = ['tasks', 'completed'] as const;
      const previousCompleted = queryClient.getQueryData(completedKey);
      mapLiveOpenTaskLists(queryClient, (tasks) =>
        tasks.filter((task) => task.id !== id)
      );
      mapLiveNowSections(queryClient, id);
      mapLiveProjects(queryClient, (project) =>
        project.nextActionTaskId === id
          ? { ...project, nextActionTaskId: null }
          : project
      );
      if (isTaskHistoryData(previousCompleted)) {
        queryClient.setQueryData(
          completedKey,
          mapTaskHistoryPageItems(previousCompleted, (items) =>
            items.filter((task) => task.id !== id)
          )
        );
      }
      return { previous, previousProjects, previousNow, previousCompleted, completedKey };
    },
    onError: (err, _variables, context) => {
      if (context?.previous) {
        restoreQuerySnapshots(queryClient, context.previous);
      }
      if (context?.previousProjects) {
        restoreQuerySnapshots(queryClient, context.previousProjects);
      }
      if (context?.previousNow) {
        restoreQuerySnapshots(queryClient, context.previousNow);
      }
      if (context?.completedKey) {
        queryClient.setQueryData(context.completedKey, context.previousCompleted);
      }
      if (isNetworkFailure(err)) {
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

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; body?: UpdateTaskBody }) =>
      taskClient.update({ id: input.id, ...(input.body ?? {}) }),
    onMutate: async ({ id, body }) => {
      await cancelLiveQueries(queryClient);
      const previous = snapshotLiveOpenTaskLists(queryClient);
      const previousProjects = snapshotLiveProjects(queryClient);
      mapLiveOpenTaskLists(queryClient, (tasks, queryKey) =>
        options.mapUpdate(tasks, queryKey, { id, body })
      );
      const projectId = body?.projectId;
      const leavingProject =
        projectId === null || (typeof projectId === 'string' && projectId.length > 0);
      if (leavingProject) {
        mapLiveProjects(queryClient, (project) => {
          if (project.nextActionTaskId !== id) {
            return project;
          }
          if (projectId === project.id) {
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
      if (isNetworkFailure(err)) {
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
