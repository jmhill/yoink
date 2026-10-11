import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { isFetchError } from '@ts-rest/react-query/v5';
import { toast } from 'sonner';
import { tsr } from '@/api/client';
import type { ExitDirection, SnoozeOption } from '@/components/capture-card';
import type { PromoteConfirmInput } from '@/components/promote-sheet';
import { cancelLiveQueries, invalidateLiveQueries } from '@/lib/live-query';
import { isCaptureHistoryData, prependCaptureHistoryPageItem } from '@/lib/use-history-pages';

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

const getSnoozeTime = (option: 'later-today' | 'tomorrow' | 'next-week'): string => {
  const now = new Date();

  switch (option) {
    case 'later-today': {
      const sixPm = new Date(now);
      sixPm.setHours(18, 0, 0, 0);
      if (now.getHours() >= 16) {
        return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
      }
      return sixPm.toISOString();
    }
    case 'tomorrow': {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      return tomorrow.toISOString();
    }
    case 'next-week': {
      const nextMonday = new Date(now);
      const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
      nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
      nextMonday.setHours(9, 0, 0, 0);
      return nextMonday.toISOString();
    }
  }
};

/**
 * Shared trash / snooze / promote mutations for Capture and Process.
 * Optimistic updates and rollback stay on the shared inbox query key.
 */
export function useInboxTriage() {
  const navigate = useNavigate();
  const tsrQueryClient = tsr.useQueryClient();
  const [exitDirections, setExitDirections] = useState<Record<string, ExitDirection>>({});
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalCapture, setTaskModalCapture] = useState<{
    id: string;
    content: string;
  } | null>(null);

  const trashMutation = tsr.trash.useMutation({
    onMutate: async ({ params }) => {
      await cancelLiveQueries(tsrQueryClient);

      const previousInbox = tsrQueryClient.list.getQueryData(['captures', 'inbox']);
      const previousTrashed = tsrQueryClient.getQueryData(['captures', 'trashed']);

      if (previousInbox?.status === 200) {
        const captureToTrash = previousInbox.body.captures.find((c) => c.id === params.id);

        tsrQueryClient.list.setQueryData(['captures', 'inbox'], {
          ...previousInbox,
          body: {
            ...previousInbox.body,
            captures: previousInbox.body.captures.filter((c) => c.id !== params.id),
            total: Math.max(0, previousInbox.body.total - 1),
          },
        });

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

    onSuccess: () => {
      toast.success('Moved to trash');
    },

    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  const snoozeMutation = tsr.snooze.useMutation({
    onMutate: async ({ params }) => {
      await cancelLiveQueries(tsrQueryClient);

      const previousInbox = tsrQueryClient.list.getQueryData(['captures', 'inbox']);
      const previousSnoozed = tsrQueryClient.list.getQueryData(['captures', 'snoozed']);

      if (previousInbox?.status === 200) {
        const captureToSnooze = previousInbox.body.captures.find((c) => c.id === params.id);

        tsrQueryClient.list.setQueryData(['captures', 'inbox'], {
          ...previousInbox,
          body: {
            ...previousInbox.body,
            captures: previousInbox.body.captures.filter((c) => c.id !== params.id),
            total: Math.max(0, previousInbox.body.total - 1),
          },
        });

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

    onSuccess: () => {
      toast.success('Snoozed');
    },

    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  const processMutation = tsr.process.useMutation({
    onMutate: async ({ params }) => {
      await cancelLiveQueries(tsrQueryClient);

      const previousInbox = tsrQueryClient.list.getQueryData(['captures', 'inbox']);

      if (previousInbox?.status === 200) {
        tsrQueryClient.list.setQueryData(['captures', 'inbox'], {
          ...previousInbox,
          body: {
            ...previousInbox.body,
            captures: previousInbox.body.captures.filter((c) => c.id !== params.id),
            total: Math.max(0, previousInbox.body.total - 1),
          },
        });
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
      body: { until: getSnoozeTime(option) },
    });
  };

  const handleProcessToTask = (capture: { id: string; content: string }) => {
    setTaskModalCapture(capture);
    setTaskModalOpen(true);
  };

  const handleConfirmPromote = (captureId: string, input: PromoteConfirmInput) => {
    setExitDirections((prev) => ({ ...prev, [captureId]: 'right' }));
    const data: { title: string; dueDate?: string; listId?: string; projectId?: string } = {
      title: input.title,
    };
    if (input.dueDate) {
      data.dueDate = input.dueDate;
    }
    if (input.listId) {
      data.listId = input.listId;
    }
    if (input.projectId) {
      data.projectId = input.projectId;
    }
    processMutation.mutate({
      params: { id: captureId },
      body: { type: 'task', data },
    });
  };

  return {
    exitDirections,
    taskModalOpen,
    setTaskModalOpen,
    taskModalCapture,
    isTrashing: trashMutation.isPending,
    isSnoozing: snoozeMutation.isPending,
    isProcessing: processMutation.isPending,
    handleTrash,
    handleSnooze,
    handleProcessToTask,
    handleConfirmPromote,
  };
}
