import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import type { ConfirmProposedProject, Project, UpdateProject } from '@yoink/api-contracts';
import { httpFailureMessage, isNetworkFailure, projectClient } from '@/api/client';
import { cancelLiveQueries, invalidateLiveQueries } from '@/lib/live-query';
import { proposalRestoredToast } from '@/lib/proposal-copy';
import { offerWhatsNext } from '@/lib/whats-next';

const isProjectListPage = (
  value: unknown
): value is { projects: Project[]; total: number } =>
  typeof value === 'object' &&
  value !== null &&
  'projects' in value &&
  Array.isArray(value.projects) &&
  'total' in value &&
  typeof value.total === 'number';

const PROPOSAL_TOAST_PREFIX = 'proposal-actions';

type ProposalCommands = {
  restoreProposal: typeof projectClient.restoreProposal;
  declineProposal: typeof projectClient.declineProposal;
  confirmProposal: typeof projectClient.confirmProposal;
  update: typeof projectClient.update;
};

export function useProposalActions(
  restoredByName: string,
  options: { onDeclined?: () => void; commands?: ProposalCommands } = {}
) {
  const commands = options.commands ?? projectClient;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const actedIds = useRef(new Set<string>());
  const toastGeneration = useRef(0);
  const toastId = () => `${PROPOSAL_TOAST_PREFIX}-${toastGeneration.current}`;
  const dismissToast = () => {
    toast.dismiss(toastId());
    toastGeneration.current += 1;
  };

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const markActed = (id: string) => {
    actedIds.current.add(id);
  };

  const restoreMutation = useMutation({
    mutationFn: (input: { id: string }) => commands.restoreProposal(input),
    onSuccess: () => {
      toast.success(proposalRestoredToast(restoredByName), { id: toastId() });
    },
    onError: (err) => {
      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      toast.error(httpFailureMessage(err) ?? 'Failed to undo');
    },
    onSettled: () => {
      void invalidateLiveQueries(queryClient);
    },
  });

  const declineMutation = useMutation({
    mutationFn: (input: { id: string }) => commands.declineProposal(input),
    onMutate: async ({ id }) => {
      markActed(id);
      await cancelLiveQueries(queryClient);
      const previous = queryClient.getQueryData(['projects', 'proposed']);
      if (isProjectListPage(previous)) {
        queryClient.setQueryData(['projects', 'proposed'], {
          ...previous,
          projects: previous.projects.filter((project) => project.id !== id),
          total: Math.max(0, previous.total - 1),
        });
      }
      return { previous };
    },
    onError: (err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['projects', 'proposed'], context.previous);
      }
      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      toast.error(httpFailureMessage(err) ?? 'Failed to turn down');
    },
    onSuccess: (_result, variables) => {
      toast.success('Turned down', {
        id: toastId(),
        action: {
          label: 'Undo',
          onClick: () => {
            dismissToast();
            restoreMutation.mutate({ id: variables.id });
          },
        },
      });
      options.onDeclined?.();
    },
    onSettled: () => {
      void invalidateLiveQueries(queryClient);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (input: { id: string } & ConfirmProposedProject) =>
      commands.confirmProposal(input),
    onMutate: async ({ id }) => {
      markActed(id);
      await cancelLiveQueries(queryClient);
      const previous = queryClient.getQueryData(['projects', 'proposed']);
      if (isProjectListPage(previous)) {
        queryClient.setQueryData(['projects', 'proposed'], {
          ...previous,
          projects: previous.projects.filter((project) => project.id !== id),
          total: Math.max(0, previous.total - 1),
        });
      }
      return { previous };
    },
    onError: (err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['projects', 'proposed'], context.previous);
      }
      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      setConfirmError(httpFailureMessage(err) ?? 'Failed to confirm');
    },
    onSuccess: (result) => {
      setConfirmOpen(false);
      setActiveProject(null);
      setConfirmError(null);
      if (result.project.status === 'active' && !result.task) {
        offerWhatsNext({
          projectId: result.project.id,
          projectName: result.project.name,
        });
        return;
      }
      toast.success('Project confirmed', {
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

  const updateMutation = useMutation({
    mutationFn: (input: { id: string } & UpdateProject) => commands.update(input),
    onError: (err) => {
      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      setEditError(httpFailureMessage(err) ?? 'Failed to save');
    },
    onSuccess: () => {
      setEditOpen(false);
      setActiveProject(null);
      setEditError(null);
      toast.success('Proposal saved');
    },
    onSettled: () => {
      void invalidateLiveQueries(queryClient);
    },
  });

  return {
    confirmOpen,
    setConfirmOpen,
    editOpen,
    setEditOpen,
    activeProject,
    confirmError,
    editError,
    isBusy:
      declineMutation.isPending ||
      confirmMutation.isPending ||
      updateMutation.isPending ||
      restoreMutation.isPending,
    wasActed: (id: string) => actedIds.current.has(id),
    openConfirm: (project: Project) => {
      setActiveProject(project);
      setConfirmError(null);
      setConfirmOpen(true);
    },
    openEdit: (project: Project) => {
      setActiveProject(project);
      setEditError(null);
      setEditOpen(true);
    },
    handleConfirm: (projectId: string, input: ConfirmProposedProject) => {
      setConfirmError(null);
      confirmMutation.mutate({ id: projectId, ...input });
    },
    handleEdit: (projectId: string, input: UpdateProject) => {
      setEditError(null);
      updateMutation.mutate({ id: projectId, ...input });
    },
    handleTurnDown: (project: Project) => {
      declineMutation.mutate({ id: project.id });
    },
  };
}
