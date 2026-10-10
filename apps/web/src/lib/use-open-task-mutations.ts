import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { isFetchError } from '@ts-rest/react-query/v5';
import { toast } from 'sonner';
import type { Task } from '@yoink/api-contracts';
import { tsrTasks } from '@/api/client';
import {
  cancelLiveQueries,
  invalidateLiveQueries,
  mapLiveOpenTaskLists,
  restoreQuerySnapshots,
  snapshotLiveOpenTaskLists,
} from '@/lib/live-query';
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

  const deleteMutation = tsrTasks.delete.useMutation({
    onMutate: async ({ params }) => {
      await cancelLiveQueries(queryClient);
      const previous = snapshotLiveOpenTaskLists(queryClient);
      const completedKey = ['tasks', 'completed'] as const;
      const previousCompleted = queryClient.getQueryData(completedKey);
      mapLiveOpenTaskLists(queryClient, (tasks) =>
        tasks.filter((task) => task.id !== params.id)
      );
      if (isTaskHistoryData(previousCompleted)) {
        queryClient.setQueryData(
          completedKey,
          mapTaskHistoryPageItems(previousCompleted, (items) =>
            items.filter((task) => task.id !== params.id)
          )
        );
      }
      return { previous, previousCompleted, completedKey };
    },
    onError: (err, _variables, context) => {
      if (context?.previous) {
        restoreQuerySnapshots(queryClient, context.previous);
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
      mapLiveOpenTaskLists(queryClient, (tasks, queryKey) =>
        options.mapUpdate(tasks, queryKey, { id: params.id, body })
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
      options.onUpdated?.();
    },
    onSettled: () => {
      void invalidateLiveQueries(queryClient);
    },
  });

  return { completeMutation, deleteMutation, updateMutation };
};
