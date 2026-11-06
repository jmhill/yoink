import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AssignableProjectStatus, Project, SetProjectNextAction } from '@yoink/api-contracts';
import { httpFailureMessage, httpStatusOf, isNetworkFailure, projectClient, taskClient } from '@/api/client';
import { invalidateLiveQueries } from '@/lib/live-query';
import type { NewNextActionTask } from '@/components/next-action-picker';
import {
  createdTaskIdFromNextAction,
  nextActionUndoRestore,
  nextActionUndoToast,
  reviewStatusUndoEnabled,
  runNextActionUndo,
} from '@/lib/review-undo';

const REVIEW_TOAST_PREFIX = 'review-inline-action';

const assignableStatus = (status: Project['status']): AssignableProjectStatus =>
  status === 'proposed' || status === 'declined' ? 'active' : status;

const messageForStatus = (err: unknown, statuses: readonly number[]): string | undefined => {
  const status = httpStatusOf(err);
  if (status === undefined || !statuses.includes(status)) {
    return undefined;
  }
  return httpFailureMessage(err);
};

const nextActionBody = (
  input: { id: string } & SetProjectNextAction
): SetProjectNextAction =>
  'newTask' in input ? { newTask: input.newTask } : { taskId: input.taskId };

export const useReviewActions = () => {
  const queryClient = useQueryClient();
  const [nextActionError, setNextActionError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const undoStatusRef = useRef(false);
  const toastGeneration = useRef(0);
  const priorNextById = useRef<ReadonlyMap<string, string | null>>(new Map());
  const priorStatusById = useRef<ReadonlyMap<string, Project>>(new Map());
  const reviewToastId = () => `${REVIEW_TOAST_PREFIX}-${String(toastGeneration.current)}`;
  const beginNextReviewToast = () => {
    toast.dismiss(reviewToastId());
    toastGeneration.current += 1;
  };
  const showNextActionUndoToast = (
    outcome: Parameters<typeof nextActionUndoToast>[0]['outcome']
  ) => {
    const shown = nextActionUndoToast({
      outcome,
      networkError: outcome.kind !== 'restored' && isNetworkFailure(outcome.error),
    });
    if (shown.type === 'success') {
      toast.success(shown.message, { id: reviewToastId() });
      return;
    }
    toast.error(shown.message);
  };

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['review'] });
    await queryClient.invalidateQueries({ queryKey: ['review', 'done'] });
    await invalidateLiveQueries(queryClient);
  };

  const rememberNext = (projectId: string, previousTaskId: string | null) => {
    priorNextById.current = new Map([...priorNextById.current, [projectId, previousTaskId]]);
  };

  const rememberStatus = (project: Project) => {
    priorStatusById.current = new Map([...priorStatusById.current, [project.id, project]]);
  };

  const deleteCreatedTask = useMutation({
    mutationFn: (input: { id: string }) => taskClient.delete(input),
    onSuccess: async () => {
      await refresh();
    },
  });

  const restoreNextActionMutation = useMutation({
    mutationFn: (input: { id: string } & SetProjectNextAction) =>
      projectClient.setNextAction(input),
    onSuccess: async () => {
      await refresh();
    },
  });

  const nextActionMutation = useMutation({
    mutationFn: (input: { id: string } & SetProjectNextAction) =>
      projectClient.setNextAction(input),
    onSuccess: async (result, variables) => {
      setNextActionError(null);
      const createdId = createdTaskIdFromNextAction({
        body: nextActionBody(variables),
        result,
      });
      const previousTaskId = priorNextById.current.get(variables.id) ?? null;
      const restore = nextActionUndoRestore({
        previousTaskId,
        createdTaskId: createdId,
      });
      await refresh();
      toast.success('Next action saved', {
        id: reviewToastId(),
        duration: 10_000,
        action: {
          label: 'Undo',
          onClick: () => {
            beginNextReviewToast();
            void runNextActionUndo({
              restore,
              restoreNextAction: () =>
                restoreNextActionMutation.mutateAsync({
                  id: variables.id,
                  ...restore.body,
                }),
              deleteCreatedTask: (taskId) =>
                deleteCreatedTask.mutateAsync({
                  id: taskId,
                }),
            }).then(showNextActionUndoToast);
          },
        },
      });
    },
    onError: (err) => {
      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      const message = messageForStatus(err, [400, 404]);
      if (message !== undefined) {
        setNextActionError(message);
        return;
      }
      toast.error('Failed to set next action');
    },
  });

  const statusMutation = useMutation({
    mutationFn: (input: {
      id: string;
      status: AssignableProjectStatus;
      waitingOn?: string | null;
      waitingSince?: string | null;
      openTasks?: 'complete' | 'remove';
    }) => projectClient.changeStatus(input),
    onSuccess: async (_result, variables) => {
      setStatusError(null);
      await refresh();
      if (undoStatusRef.current) {
        undoStatusRef.current = false;
        toast.success('Project status restored', { id: reviewToastId() });
        return;
      }
      if (!reviewStatusUndoEnabled(variables.status)) {
        toast.success('Project status saved', { id: reviewToastId() });
        return;
      }
      toast.success('Project status saved', {
        id: reviewToastId(),
        action: {
          label: 'Undo',
          onClick: () => {
            const prior = priorStatusById.current.get(variables.id);
            if (prior === undefined) {
              return;
            }
            beginNextReviewToast();
            undoStatusRef.current = true;
            statusMutation.mutate({
              id: variables.id,
              status: assignableStatus(prior.status),
              waitingOn: prior.waitingOn,
              waitingSince: prior.waitingSince,
            });
          },
        },
      });
    },
    onError: (err) => {
      undoStatusRef.current = false;
      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      const message = messageForStatus(err, [400, 403, 409]);
      if (message !== undefined) {
        setStatusError(message);
        return;
      }
      toast.error('Failed to change project status');
    },
  });

  return {
    nextActionError,
    statusError,
    isNextActionPending:
      nextActionMutation.isPending ||
      restoreNextActionMutation.isPending ||
      deleteCreatedTask.isPending,
    isStatusPending: statusMutation.isPending,
    setNextAction: (input: {
      project: Project;
      body:
        | { taskId: string }
        | { taskId: null }
        | { newTask: NewNextActionTask };
    }) => {
      rememberNext(input.project.id, input.project.nextActionTaskId);
      nextActionMutation.mutate({
        id: input.project.id,
        ...input.body,
      });
    },
    changeStatus: (input: {
      project: Project;
      body: {
        status: AssignableProjectStatus;
        waitingOn?: string | null;
        waitingSince?: string | null;
        openTasks?: 'complete' | 'remove';
      };
    }) => {
      rememberStatus(input.project);
      statusMutation.mutate({
        id: input.project.id,
        ...input.body,
      });
    },
  };
};
