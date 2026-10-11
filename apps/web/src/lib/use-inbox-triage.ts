import { useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { isFetchError } from '@ts-rest/react-query/v5';
import { toast } from 'sonner';
import { tsr, tsrProjects } from '@/api/client';
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

const messageFromUnknown = (err: unknown): string | null => {
  if (typeof err !== 'object' || err === null || !('body' in err)) {
    return null;
  }
  const { body } = err;
  if (typeof body !== 'object' || body === null || !('message' in body)) {
    return null;
  }
  return typeof body.message === 'string' ? body.message : null;
};

const errorCode = (err: unknown): string | null => {
  if (typeof err !== 'object' || err === null || !('body' in err)) {
    return null;
  }
  const { body } = err;
  if (typeof body !== 'object' || body === null || !('code' in body)) {
    return null;
  }
  return typeof body.code === 'string' ? body.code : null;
};

type ProcessCapture = {
  id: string;
  content: string;
  sourceUrl?: string | null;
};

type InboxTriageOptions = {
  announceTaskCreated?: boolean;
};

/**
 * Shared trash / snooze / promote mutations for Capture and Process.
 * Optimistic updates and rollback stay on the shared inbox query key.
 */
export function useInboxTriage(options: InboxTriageOptions = {}) {
  const announceTaskCreated = options.announceTaskCreated ?? true;
  const navigate = useNavigate();
  const tsrQueryClient = tsr.useQueryClient();
  const projectsClient = tsrProjects.useQueryClient();
  const actedIds = useRef(new Set<string>());
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

  const restoreMutation = tsr.restore.useMutation({
    onSuccess: () => {
      toast.success('Restored to inbox');
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to undo');
      }
    },
    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  const unsnoozeMutation = tsr.unsnooze.useMutation({
    onSuccess: () => {
      toast.success('Moved to inbox');
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to undo');
      }
    },
    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  const trashMutation = tsr.trash.useMutation({
    onMutate: async ({ params }) => {
      markActed(params.id);
      await cancelLiveQueries(tsrQueryClient);

      const previousInbox = tsrQueryClient.list.getQueryData(['captures', 'inbox']);
      const previousTrashed = tsrQueryClient.getQueryData(['captures', 'trashed']);

      if (previousInbox?.status === 200) {
        const captureToTrash = previousInbox.body.captures.find((c) => c.id === params.id);

        tsrQueryClient.list.setQueryData(
          ['captures', 'inbox'],
          inboxQueryWithoutCapture(previousInbox, params.id)
        );

        if (captureToTrash && isCaptureHistoryData(previousTrashed)) {
          tsrQueryClient.setQueryData(
            ['captures', 'trashed'],
            prependCaptureHistoryPageItem(previousTrashed, {
              ...captureToTrash,
              status: 'trashed',
            })
          );
        }
      }

      return { previousInbox, previousTrashed };
    },

    onError: (err, _variables, context) => {
      if (context?.previousInbox) {
        tsrQueryClient.list.setQueryData(['captures', 'inbox'], context.previousInbox);
      }
      if (context?.previousTrashed) {
        tsrQueryClient.setQueryData(['captures', 'trashed'], context.previousTrashed);
      }

      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to trash');
      }
    },

    onSuccess: (_data, variables) => {
      toast.success('Moved to trash', {
        action: {
          label: 'Undo',
          onClick: () => {
            restoreMutation.mutate({ params: { id: variables.params.id }, body: {} });
          },
        },
      });
    },

    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  const snoozeMutation = tsr.snooze.useMutation({
    onMutate: async ({ params }) => {
      markActed(params.id);
      await cancelLiveQueries(tsrQueryClient);

      const previousInbox = tsrQueryClient.list.getQueryData(['captures', 'inbox']);
      const previousSnoozed = tsrQueryClient.list.getQueryData(['captures', 'snoozed']);

      if (previousInbox?.status === 200) {
        const captureToSnooze = previousInbox.body.captures.find((c) => c.id === params.id);

        tsrQueryClient.list.setQueryData(
          ['captures', 'inbox'],
          inboxQueryWithoutCapture(previousInbox, params.id)
        );

        if (captureToSnooze && previousSnoozed?.status === 200) {
          tsrQueryClient.list.setQueryData(['captures', 'snoozed'], {
            ...previousSnoozed,
            body: {
              ...previousSnoozed.body,
              captures: [captureToSnooze, ...previousSnoozed.body.captures],
              total: previousSnoozed.body.total + 1,
            },
          });
        }
      }

      return { previousInbox, previousSnoozed };
    },

    onError: (err, _variables, context) => {
      if (context?.previousInbox) {
        tsrQueryClient.list.setQueryData(['captures', 'inbox'], context.previousInbox);
      }
      if (context?.previousSnoozed) {
        tsrQueryClient.list.setQueryData(['captures', 'snoozed'], context.previousSnoozed);
      }

      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error('Failed to snooze');
      }
    },

    onSuccess: (_data, variables) => {
      toast.success('Snoozed', {
        action: {
          label: 'Undo',
          onClick: () => {
            unsnoozeMutation.mutate({ params: { id: variables.params.id }, body: {} });
          },
        },
      });
    },

    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  const processMutation = tsr.process.useMutation({
    onMutate: async ({ params }) => {
      markActed(params.id);
      await cancelLiveQueries(tsrQueryClient);

      const previousInbox = tsrQueryClient.list.getQueryData(['captures', 'inbox']);

      if (previousInbox?.status === 200) {
        tsrQueryClient.list.setQueryData(
          ['captures', 'inbox'],
          inboxQueryWithoutCapture(previousInbox, params.id)
        );
      }

      return { previousInbox };
    },

    onError: (err, _variables, context) => {
      if (context?.previousInbox) {
        tsrQueryClient.list.setQueryData(['captures', 'inbox'], context.previousInbox);
      }

      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
      } else {
        toast.error(messageFromUnknown(err) ?? 'Failed to create task');
      }
    },

    onSuccess: () => {
      if (announceTaskCreated) {
        toast.success('Task created', {
          action: {
            label: 'View',
            onClick: () => navigate({ to: '/tasks' }),
          },
        });
      }
      setTaskModalOpen(false);
      setTaskModalCapture(null);
    },

    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  const processToProjectMutation = tsr.processToProject.useMutation({
    onMutate: async ({ params }) => {
      markActed(params.id);
      await cancelLiveQueries(tsrQueryClient);
      const previousInbox = tsrQueryClient.list.getQueryData(['captures', 'inbox']);
      const previousProjects = projectsClient.list.getQueryData(['projects']);
      if (previousInbox?.status === 200) {
        tsrQueryClient.list.setQueryData(
          ['captures', 'inbox'],
          inboxQueryWithoutCapture(previousInbox, params.id)
        );
      }
      return { previousInbox, previousProjects };
    },
    onError: (err, _variables, context) => {
      if (context?.previousInbox) {
        tsrQueryClient.list.setQueryData(['captures', 'inbox'], context.previousInbox);
      }
      if (context?.previousProjects) {
        projectsClient.list.setQueryData(['projects'], context.previousProjects);
      }
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      const code = errorCode(err);
      if (code === 'DUPLICATE_PROJECT_NAME') {
        setProjectSheetError(messageFromUnknown(err) ?? 'A project with this name already exists');
        return;
      }
      if (code === 'CAPTURE_NOT_IN_INBOX') {
        setProjectSheetOpen(false);
        setProjectSheetCapture(null);
        toast('That capture was already processed');
        return;
      }
      toast.error(messageFromUnknown(err) ?? 'Failed to create project');
    },
    onSuccess: (result) => {
      if (result.status !== 201) {
        return;
      }
      const previousProjects = projectsClient.list.getQueryData(['projects']);
      if (previousProjects?.status === 200) {
        projectsClient.list.setQueryData(['projects'], {
          ...previousProjects,
          body: {
            ...previousProjects.body,
            projects: [result.body.project, ...previousProjects.body.projects],
            total: previousProjects.body.total + 1,
          },
        });
      }
      setProjectSheetOpen(false);
      setProjectSheetCapture(null);
      setProjectSheetError(null);
      if (result.body.project.status === 'active') {
        offerWhatsNext({
          projectId: result.body.project.id,
          projectName: result.body.project.name,
        });
      }
    },
    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  const handleTrash = (id: string, direction: ExitDirection) => {
    setExitDirections((prev) => ({ ...prev, [id]: direction }));
    trashMutation.mutate({
      params: { id },
      body: {},
    });
  };

  const handleSnooze = (id: string, option: SnoozeOption, direction: ExitDirection) => {
    setExitDirections((prev) => ({ ...prev, [id]: direction }));
    snoozeMutation.mutate({
      params: { id },
      body: { until: snoozeUntil(option, new Date()) },
    });
  };

  const handleProcessToTask = (capture: { id: string; content: string }) => {
    setTaskModalCapture(capture);
    setTaskModalOpen(true);
  };

  const handleConfirmPromote = (captureId: string, input: PromoteConfirmInput) => {
    setExitDirections((prev) => ({ ...prev, [captureId]: 'right' }));
    processMutation.mutate({
      params: { id: captureId },
      body: { type: 'task', data: promoteTaskData(input) },
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
      params: { id: captureId },
      body: input,
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
