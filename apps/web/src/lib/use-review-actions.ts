import { useRef, useState } from 'react';
import { isFetchError } from '@ts-rest/react-query/v5';
import { toast } from 'sonner';
import {
  projectContract,
  type AssignableProjectStatus,
  type Project,
} from '@yoink/api-contracts';
import { tsrProjects, tsrTasks } from '@/api/client';
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

export const useReviewActions = () => {
  const queryClient = tsrProjects.useQueryClient();
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
      networkError: outcome.kind !== 'restored' && isFetchError(outcome.error),
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

  const deleteCreatedTask = tsrTasks.delete.useMutation({
    onSuccess: async () => {
      await refresh();
    },
  });

  const restoreNextActionMutation = tsrProjects.setNextAction.useMutation({
    onSuccess: async (result) => {
      if (result.status !== 200) return;
      await refresh();
    },
  });

  const nextActionMutation = tsrProjects.setNextAction.useMutation({
    onSuccess: async (result, variables) => {
      if (result.status !== 200) return;
      setNextActionError(null);
      const createdId = createdTaskIdFromNextAction({
        body: variables.body,
        result: result.body,
      });
      const previousTaskId = priorNextById.current.get(variables.params.id) ?? null;
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
                  params: { id: variables.params.id },
                  body: restore.body,
                }),
              deleteCreatedTask: (taskId) =>
                deleteCreatedTask.mutateAsync({
                  params: { id: taskId },
                }),
            }).then(showNextActionUndoToast);
          },
        },
      });
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

  const statusMutation = tsrProjects.changeStatus.useMutation({
    onSuccess: async (result, variables) => {
      if (result.status !== 200) return;
      setStatusError(null);
      await refresh();
      if (undoStatusRef.current) {
        undoStatusRef.current = false;
        toast.success('Project status restored', { id: reviewToastId() });
        return;
      }
      if (!reviewStatusUndoEnabled(variables.body.status)) {
        toast.success('Project status saved', { id: reviewToastId() });
        return;
      }
      toast.success('Project status saved', {
        id: reviewToastId(),
        action: {
          label: 'Undo',
          onClick: () => {
            const prior = priorStatusById.current.get(variables.params.id);
            if (prior === undefined) {
              return;
            }
            beginNextReviewToast();
            undoStatusRef.current = true;
            statusMutation.mutate({
              params: { id: variables.params.id },
              body: {
                status: assignableStatus(prior.status),
                waitingOn: prior.waitingOn,
                waitingSince: prior.waitingSince,
              },
            });
          },
        },
      });
    },
    onError: (err) => {
      undoStatusRef.current = false;
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
        params: { id: input.project.id },
        body: input.body,
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
        params: { id: input.project.id },
        body: input.body,
      });
    },
  };
};
