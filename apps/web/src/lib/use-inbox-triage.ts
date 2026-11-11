import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import type { Capture, Project } from '@yoink/api-contracts';
import {
  captureClient,
  httpFailureBody,
  httpFailureMessage,
  isNetworkFailure,
  processToProjectClient,
} from '@/api/client';
import type { ExitDirection, SnoozeOption } from '@/components/capture-card';
import type { PromoteConfirmInput } from '@/components/promote-sheet';
import type { ProcessProjectConfirmInput } from '@/components/process-project-sheet';
import {
  inboxQueryWithoutCapture,
  promoteTaskData,
  snoozeUntil,
} from '@/lib/inbox-triage';
import { cancelLiveQueries, invalidateLiveQueries } from '@/lib/live-query';
import { isCaptureHistoryData, prependCaptureHistoryPageItem } from '@/lib/use-history-pages';
import { offerWhatsNext } from '@/lib/whats-next';

const errorCode = (err: unknown): string | undefined => {
  const body = httpFailureBody(err);
  if (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    typeof body.code === 'string'
  ) {
    return body.code;
  }
  return undefined;
};

/** The process count and the Inbox screen keep separate list keys. */
const inboxListQueryKeys = [
  ['captures', 'inbox'],
  ['captures', 'inbox', 'screen'],
] as const;

type InboxListSnapshot = {
  queryKey: (typeof inboxListQueryKeys)[number];
  data: unknown;
};

const snapshotInboxLists = (
  queryClient: ReturnType<typeof useQueryClient>
): InboxListSnapshot[] =>
  inboxListQueryKeys.map((queryKey) => ({
    queryKey,
    data: queryClient.getQueryData(queryKey),
  }));

const restoreInboxLists = (
  queryClient: ReturnType<typeof useQueryClient>,
  snapshots: InboxListSnapshot[] | undefined
) => {
  for (const snapshot of snapshots ?? []) {
    queryClient.setQueryData(snapshot.queryKey, snapshot.data);
  }
};

const removeFromInboxLists = (
  queryClient: ReturnType<typeof useQueryClient>,
  id: string
) => {
  for (const queryKey of inboxListQueryKeys) {
    const page = queryClient.getQueryData(queryKey);
    if (isCapturePage(page)) {
      queryClient.setQueryData(queryKey, inboxQueryWithoutCapture(page, id));
    }
  }
};

const findInboxCapture = (
  queryClient: ReturnType<typeof useQueryClient>,
  id: string
): Capture | undefined => {
  for (const queryKey of inboxListQueryKeys) {
    const page = queryClient.getQueryData(queryKey);
    if (!isCapturePage(page)) continue;
    const capture = page.captures.find((item) => item.id === id);
    if (capture) return capture;
  }
  return undefined;
};

const isCapturePage = (
  value: unknown
): value is { captures: Capture[]; total: number } =>
  typeof value === 'object' &&
  value !== null &&
  'captures' in value &&
  Array.isArray(value.captures) &&
  'total' in value &&
  typeof value.total === 'number';

const isProjectListPage = (
  value: unknown
): value is { projects: Project[]; total: number } =>
  typeof value === 'object' &&
  value !== null &&
  'projects' in value &&
  Array.isArray(value.projects) &&
  'total' in value &&
  typeof value.total === 'number';

type ProcessCapture = {
  id: string;
  content: string;
  sourceUrl?: string | null;
};

const INBOX_TRIAGE_TOAST_PREFIX = 'inbox-triage';

type InboxTriageActions = {
  trash: (input: { id: string }) => Promise<unknown>;
  restore: (input: { id: string }) => Promise<unknown>;
  snooze: (input: { id: string; until: string }) => Promise<unknown>;
  unsnooze: (input: { id: string }) => Promise<unknown>;
  process: (input: {
    id: string;
    type: 'task';
    data: ReturnType<typeof promoteTaskData>;
  }) => Promise<unknown>;
  processToProject: (
    input: { id: string } & ProcessProjectConfirmInput
  ) => Promise<{ project: Project }>;
};

const aliasTriageActions: InboxTriageActions = {
  trash: (input) => captureClient.trash(input),
  restore: (input) => captureClient.restore(input),
  snooze: (input) => captureClient.snooze(input),
  unsnooze: (input) => captureClient.unsnooze(input),
  process: (input) => captureClient.process(input),
  processToProject: (input) => processToProjectClient.processToProject(input),
};

/**
 * Shared trash / snooze / promote mutations for Capture and Process.
 * Optimistic updates and rollback cover the badge list and the Inbox screen list.
 * Process passes the `/web-api` actions. Capture keeps the alias.
 */
export function useInboxTriage(actions: InboxTriageActions = aliasTriageActions) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const actedIds = useRef(new Set<string>());
  const triageToastGeneration = useRef(0);
  const triageToastId = () => `${INBOX_TRIAGE_TOAST_PREFIX}-${triageToastGeneration.current}`;
  const dismissTriageToast = () => {
    toast.dismiss(triageToastId());
    triageToastGeneration.current += 1;
  };
  const [exitDirections, setExitDirections] = useState<Record<string, ExitDirection>>({});
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalCapture, setTaskModalCapture] = useState<{
    id: string;
    content: string;
  } | null>(null);
  const [projectSheetOpen, setProjectSheetOpen] = useState(false);
  const [projectSheetStatus, setProjectSheetStatus] = useState<'active' | 'someday'>('active');
  const [projectSheetCapture, setProjectSheetCapture] = useState<ProcessCapture | null>(null);
  const [projectSheetError, setProjectSheetError] = useState<string | null>(null);

  const markActed = (id: string) => {
    actedIds.current.add(id);
  };

  const restoreMutation = useMutation({
    mutationFn: (input: { id: string }) => actions.restore(input),
    onSuccess: () => {
      toast.success('Restored to inbox', { id: triageToastId() });
    },
    onError: (err) => {
      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to undo');
      }
    },
    onSettled: () => {
      void invalidateLiveQueries(queryClient);
    },
  });

  const unsnoozeMutation = useMutation({
    mutationFn: (input: { id: string }) => actions.unsnooze(input),
    onSuccess: () => {
      toast.success('Moved to inbox', { id: triageToastId() });
    },
    onError: (err) => {
      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to undo');
      }
    },
    onSettled: () => {
      void invalidateLiveQueries(queryClient);
    },
  });

  const trashMutation = useMutation({
    mutationFn: (input: { id: string }) => actions.trash(input),
    onMutate: async ({ id }) => {
      markActed(id);
      await cancelLiveQueries(queryClient);

      const previousInbox = snapshotInboxLists(queryClient);
      const previousTrashed = queryClient.getQueryData(['captures', 'trashed']);
      const captureToTrash = findInboxCapture(queryClient, id);
      removeFromInboxLists(queryClient, id);

      if (captureToTrash && isCaptureHistoryData(previousTrashed)) {
        queryClient.setQueryData(
          ['captures', 'trashed'],
          prependCaptureHistoryPageItem(previousTrashed, {
            ...captureToTrash,
            status: 'trashed',
          })
        );
      }

      return { previousInbox, previousTrashed };
    },

    onError: (err, _variables, context) => {
      restoreInboxLists(queryClient, context?.previousInbox);
      if (context?.previousTrashed) {
        queryClient.setQueryData(['captures', 'trashed'], context.previousTrashed);
      }

      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to trash');
      }
    },

    onSuccess: (_data, variables) => {
      toast.success('Moved to trash', {
        id: triageToastId(),
        action: {
          label: 'Undo',
          onClick: () => {
            dismissTriageToast();
            restoreMutation.mutate({ id: variables.id });
          },
        },
      });
    },

    onSettled: () => {
      void invalidateLiveQueries(queryClient);
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: (input: { id: string; until: string }) => actions.snooze(input),
    onMutate: async ({ id }) => {
      markActed(id);
      await cancelLiveQueries(queryClient);

      const previousInbox = snapshotInboxLists(queryClient);
      const previousSnoozed = queryClient.getQueryData(['captures', 'snoozed']);
      const captureToSnooze = findInboxCapture(queryClient, id);
      removeFromInboxLists(queryClient, id);

      if (captureToSnooze && isCapturePage(previousSnoozed)) {
        queryClient.setQueryData(['captures', 'snoozed'], {
          ...previousSnoozed,
          captures: [captureToSnooze, ...previousSnoozed.captures],
          total: previousSnoozed.total + 1,
        });
      }

      return { previousInbox, previousSnoozed };
    },

    onError: (err, _variables, context) => {
      restoreInboxLists(queryClient, context?.previousInbox);
      if (context?.previousSnoozed) {
        queryClient.setQueryData(['captures', 'snoozed'], context.previousSnoozed);
      }

      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to snooze');
      }
    },

    onSuccess: (_data, variables) => {
      toast.success('Snoozed', {
        id: triageToastId(),
        action: {
          label: 'Undo',
          onClick: () => {
            dismissTriageToast();
            unsnoozeMutation.mutate({ id: variables.id });
          },
        },
      });
    },

    onSettled: () => {
      void invalidateLiveQueries(queryClient);
    },
  });

  const processMutation = useMutation({
    mutationFn: (input: {
      id: string;
      type: 'task';
      data: ReturnType<typeof promoteTaskData>;
    }) => actions.process(input),
    onMutate: async ({ id }) => {
      markActed(id);
      await cancelLiveQueries(queryClient);

      const previousInbox = snapshotInboxLists(queryClient);
      removeFromInboxLists(queryClient, id);
      return { previousInbox };
    },

    onError: (err, _variables, context) => {
      restoreInboxLists(queryClient, context?.previousInbox);

      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error(httpFailureMessage(err) ?? 'Failed to create task');
      }
    },

    onSuccess: () => {
      toast.success('Task created', {
        action: {
          label: 'View',
          onClick: () => navigate({ to: '/tasks' }),
        },
      });
      setTaskModalOpen(false);
      setTaskModalCapture(null);
    },

    onSettled: () => {
      void invalidateLiveQueries(queryClient);
    },
  });

  const processToProjectMutation = useMutation({
    mutationFn: (input: { id: string } & ProcessProjectConfirmInput) =>
      actions.processToProject(input),
    onMutate: async ({ id }) => {
      markActed(id);
      await cancelLiveQueries(queryClient);
      const previousInbox = snapshotInboxLists(queryClient);
      const previousProjects = queryClient.getQueryData(['projects']);
      removeFromInboxLists(queryClient, id);
      return { previousInbox, previousProjects };
    },
    onError: (err, _variables, context) => {
      restoreInboxLists(queryClient, context?.previousInbox);
      if (context?.previousProjects) {
        queryClient.setQueryData(['projects'], context.previousProjects);
      }
      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      const code = errorCode(err);
      if (code === 'DUPLICATE_PROJECT_NAME') {
        setProjectSheetError(httpFailureMessage(err) ?? 'A project with this name already exists');
        return;
      }
      if (code === 'CAPTURE_NOT_IN_INBOX') {
        setProjectSheetOpen(false);
        setProjectSheetCapture(null);
        toast('That capture was already processed');
        return;
      }
      toast.error(httpFailureMessage(err) ?? 'Failed to create project');
    },
    onSuccess: (result) => {
      const previousProjects = queryClient.getQueryData(['projects']);
      if (isProjectListPage(previousProjects)) {
        queryClient.setQueryData(['projects'], {
          ...previousProjects,
          projects: [result.project, ...previousProjects.projects],
          total: previousProjects.total + 1,
        });
      }
      setProjectSheetOpen(false);
      setProjectSheetCapture(null);
      setProjectSheetError(null);
      if (result.project.status === 'active') {
        offerWhatsNext({
          projectId: result.project.id,
          projectName: result.project.name,
        });
        return;
      }
      toast.success('Project created', {
        action: {
          label: 'View',
          onClick: () =>
            navigate({
              to: '/projects/$projectId',
              params: { projectId: result.project.id },
            }),
        },
      });
    },
    onSettled: () => {
      void invalidateLiveQueries(queryClient);
    },
  });

  const handleTrash = (id: string, direction: ExitDirection) => {
    setExitDirections((prev) => ({ ...prev, [id]: direction }));
    trashMutation.mutate({ id });
  };

  const handleSnooze = (id: string, option: SnoozeOption, direction: ExitDirection) => {
    setExitDirections((prev) => ({ ...prev, [id]: direction }));
    snoozeMutation.mutate({
      id,
      until: snoozeUntil(option, new Date()),
    });
  };

  const handleProcessToTask = (capture: { id: string; content: string }) => {
    setTaskModalCapture(capture);
    setTaskModalOpen(true);
  };

  const handleConfirmPromote = (captureId: string, input: PromoteConfirmInput) => {
    setExitDirections((prev) => ({ ...prev, [captureId]: 'right' }));
    processMutation.mutate({
      id: captureId,
      type: 'task',
      data: promoteTaskData(input),
    });
  };

  const handleOpenProjectSheet = (capture: ProcessCapture, status: 'active' | 'someday') => {
    setProjectSheetCapture(capture);
    setProjectSheetStatus(status);
    setProjectSheetError(null);
    setProjectSheetOpen(true);
  };

  const handleConfirmProject = (captureId: string, input: ProcessProjectConfirmInput) => {
    setProjectSheetError(null);
    processToProjectMutation.mutate({
      id: captureId,
      ...input,
    });
  };

  return {
    exitDirections,
    taskModalOpen,
    setTaskModalOpen,
    taskModalCapture,
    projectSheetOpen,
    setProjectSheetOpen,
    projectSheetStatus,
    projectSheetCapture,
    projectSheetError,
    isTrashing: trashMutation.isPending,
    isSnoozing: snoozeMutation.isPending,
    isProcessing: processMutation.isPending || processToProjectMutation.isPending,
    wasActed: (id: string) => actedIds.current.has(id),
    handleTrash,
    handleSnooze,
    handleProcessToTask,
    handleConfirmPromote,
    handleOpenProjectSheet,
    handleConfirmProject,
  };
}
