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
import { createdTaskIdFromNextAction, reviewStatusUndoEnabled } from '@/lib/review-undo';

const REVIEW_TOAST_ID = 'review-inline-action';

const assignableStatus = (status: Project['status']): AssignableProjectStatus =>
  status === 'proposed' ? 'active' : status;

const withoutKey = <K, V>(map: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> =>
  new Map([...map].filter(([entryKey]) => entryKey !== key));

export const useReviewActions = () => {
  const queryClient = tsrProjects.useQueryClient();
  const [nextActionError, setNextActionError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const undoNextRef = useRef(false);
  const undoStatusRef = useRef(false);
  const priorNextById = useRef<ReadonlyMap<string, string | null>>(new Map());
  const priorStatusById = useRef<ReadonlyMap<string, Project>>(new Map());
  const createdNextById = useRef<ReadonlyMap<string, string>>(new Map());

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['review'] });
    await queryClient.invalidateQueries({ queryKey: ['review', 'done'] });
    await invalidateLiveQueries(queryClient);
  };

  const rememberNext = (projectId: string, taskId: string | null) => {
    priorNextById.current = new Map([...priorNextById.current, [projectId, taskId]]);
  };

  const rememberStatus = (project: Project) => {
    priorStatusById.current = new Map([...priorStatusById.current, [project.id, project]]);
  };

  const deleteCreatedTask = tsrTasks.delete.useMutation({
    onSuccess: async () => {
      await refresh();
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      toast.error('Failed to remove the created task');
    },
  });

  const nextActionMutation = tsrProjects.setNextAction.useMutation({
    onSuccess: async (result, variables) => {
      if (result.status !== 200) return;
      setNextActionError(null);
      if (undoNextRef.current) {
        undoNextRef.current = false;
        const createdId = createdNextById.current.get(variables.params.id);
        if (createdId !== undefined) {
          createdNextById.current = withoutKey(createdNextById.current, variables.params.id);
          await deleteCreatedTask.mutateAsync({ params: { id: createdId } });
        }
        await refresh();
        toast.success('Next action restored', { id: REVIEW_TOAST_ID });
        return;
      }
      const createdId = createdTaskIdFromNextAction({
        body: variables.body,
        result: result.body,
      });
      if (createdId !== null) {
        createdNextById.current = new Map([
          ...createdNextById.current,
          [variables.params.id, createdId],
        ]);
      }
      await refresh();
      toast.success('Next action saved', {
        id: REVIEW_TOAST_ID,
        action: {
          label: 'Undo',
          onClick: () => {
            const prior = priorNextById.current.get(variables.params.id) ?? null;
            undoNextRef.current = true;
            nextActionMutation.mutate({
              params: { id: variables.params.id },
              body: { taskId: prior },
            });
          },
        },
      });
    },
    onError: (err) => {
      undoNextRef.current = false;
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
        toast.success('Project status restored', { id: REVIEW_TOAST_ID });
        return;
      }
      if (!reviewStatusUndoEnabled(variables.body.status)) {
        toast.success('Project status saved', { id: REVIEW_TOAST_ID });
        return;
      }
      toast.success('Project status saved', {
        id: REVIEW_TOAST_ID,
        action: {
          label: 'Undo',
          onClick: () => {
            const prior = priorStatusById.current.get(variables.params.id);
            if (prior === undefined) {
              return;
            }
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
    isNextActionPending: nextActionMutation.isPending || deleteCreatedTask.isPending,
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
