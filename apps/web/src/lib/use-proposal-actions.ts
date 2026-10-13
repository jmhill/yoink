import { useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { isFetchError } from '@ts-rest/react-query/v5';
import { toast } from 'sonner';
import { tsr, tsrProjects } from '@/api/client';
import type { ConfirmProposedProject, Project, UpdateProject } from '@yoink/api-contracts';
import { cancelLiveQueries, invalidateLiveQueries } from '@/lib/live-query';
import { proposalRestoredToast } from '@/lib/proposal-copy';
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

const PROPOSAL_TOAST_PREFIX = 'proposal-actions';

export function useProposalActions(
  restoredByName: string,
  options: { onDeclined?: () => void } = {}
) {
  const navigate = useNavigate();
  const tsrQueryClient = tsr.useQueryClient();
  const projectsClient = tsrProjects.useQueryClient();
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

  const restoreMutation = tsrProjects.restoreProposal.useMutation({
    onSuccess: (result) => {
      if (result.status !== 200) {
        return;
      }
      toast.success(proposalRestoredToast(restoredByName), { id: toastId() });
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      toast.error(messageFromUnknown(err) ?? 'Failed to undo');
    },
    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  const declineMutation = tsrProjects.declineProposal.useMutation({
    onMutate: async ({ params }) => {
      markActed(params.id);
      await cancelLiveQueries(tsrQueryClient);
      const previous = projectsClient.list.getQueryData(['projects', 'proposed']);
      if (previous?.status === 200) {
        projectsClient.list.setQueryData(['projects', 'proposed'], {
          ...previous,
          body: {
            ...previous.body,
            projects: previous.body.projects.filter((project) => project.id !== params.id),
            total: Math.max(0, previous.body.total - 1),
          },
        });
      }
      return { previous };
    },
    onError: (err, _variables, context) => {
      if (context?.previous) {
        projectsClient.list.setQueryData(['projects', 'proposed'], context.previous);
      }
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      toast.error(messageFromUnknown(err) ?? 'Failed to turn down');
    },
    onSuccess: (_result, variables) => {
      toast.success('Turned down', {
        id: toastId(),
        action: {
          label: 'Undo',
          onClick: () => {
            dismissToast();
            restoreMutation.mutate({ params: { id: variables.params.id }, body: {} });
          },
        },
      });
      options.onDeclined?.();
    },
    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  const confirmMutation = tsrProjects.confirmProposal.useMutation({
    onMutate: async ({ params }) => {
      markActed(params.id);
      await cancelLiveQueries(tsrQueryClient);
      const previous = projectsClient.list.getQueryData(['projects', 'proposed']);
      if (previous?.status === 200) {
        projectsClient.list.setQueryData(['projects', 'proposed'], {
          ...previous,
          body: {
            ...previous.body,
            projects: previous.body.projects.filter((project) => project.id !== params.id),
            total: Math.max(0, previous.body.total - 1),
          },
        });
      }
      return { previous };
    },
    onError: (err, _variables, context) => {
      if (context?.previous) {
        projectsClient.list.setQueryData(['projects', 'proposed'], context.previous);
      }
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      setConfirmError(messageFromUnknown(err) ?? 'Failed to confirm');
    },
    onSuccess: (result) => {
      if (result.status !== 200) {
        return;
      }
      setConfirmOpen(false);
      setActiveProject(null);
      setConfirmError(null);
      if (result.body.project.status === 'active' && !result.body.task) {
        offerWhatsNext({
          projectId: result.body.project.id,
          projectName: result.body.project.name,
        });
        return;
      }
      toast.success('Project confirmed', {
        action: {
          label: 'View',
          onClick: () =>
            navigate({
              to: '/projects/$projectId',
              params: { projectId: result.body.project.id },
            }),
        },
      });
    },
    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
    },
  });

  const updateMutation = tsrProjects.update.useMutation({
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      setEditError(messageFromUnknown(err) ?? 'Failed to save');
    },
    onSuccess: (result) => {
      if (result.status !== 200) {
        return;
      }
      setEditOpen(false);
      setActiveProject(null);
      setEditError(null);
      toast.success('Proposal saved');
    },
    onSettled: () => {
      void invalidateLiveQueries(tsrQueryClient);
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
      confirmMutation.mutate({ params: { id: projectId }, body: input });
    },
    handleEdit: (projectId: string, input: UpdateProject) => {
      setEditError(null);
      updateMutation.mutate({ params: { id: projectId }, body: input });
    },
    handleTurnDown: (project: Project) => {
      declineMutation.mutate({ params: { id: project.id }, body: {} });
    },
  };
}
