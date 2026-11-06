import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@yoink/ui-base/components/button';
import { PILE_SAFETY_CAP } from '@yoink/api-contracts';
import { toast } from 'sonner';
import {
  authClient,
  httpFailureMessage,
  httpStatusOf,
  isNetworkFailure,
  listClient,
  organizationClient,
  projectClient,
} from '@/api/client';
import { memberLabel } from '@/api/auth';
import { NextActionPicker, type NewNextActionTask } from '@/components/next-action-picker';
import {
  dismissWhatsNext,
  subscribeWhatsNext,
  type WhatsNextPrompt,
} from '@/lib/whats-next';

export function WhatsNextHost() {
  const [prompt, setPrompt] = useState<WhatsNextPrompt | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => subscribeWhatsNext(setPrompt), []);

  const { data: openTasksData } = useQuery({
    queryKey: ['tasks', 'project', prompt?.projectId ?? ''],
    queryFn: () =>
      projectClient.listOpenTasks({
        id: prompt?.projectId ?? '',
        limit: PILE_SAFETY_CAP,
      }),
    enabled: Boolean(prompt?.projectId),
  });

  const { data: listsData } = useQuery({
    queryKey: ['lists'],
    queryFn: () => listClient.list({ limit: PILE_SAFETY_CAP }),
    refetchInterval: false,
    enabled: Boolean(prompt),
  });

  const { data: sessionData } = useQuery({
    queryKey: ['session'],
    queryFn: () => authClient.session(),
    refetchInterval: false,
    enabled: Boolean(prompt),
  });
  const organizationId = sessionData?.organizationId;

  const membersQuery = useQuery({
    queryKey: ['organization-members', organizationId ?? ''],
    queryFn: () =>
      organizationClient.listMembers({ organizationId: organizationId ?? '' }),
    enabled: Boolean(prompt && organizationId),
    refetchInterval: false,
  });

  const setMutation = useMutation({
    mutationFn: (input: Parameters<typeof projectClient.setNextAction>[0]) =>
      projectClient.setNextAction(input),
    onSuccess: async () => {
      setFormError(null);
      toast.success('Next action set');
      dismissWhatsNext();
      setPrompt(null);
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['review'] });
    },
    onError: (err) => {
      if (isNetworkFailure(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      const status = httpStatusOf(err);
      if (status === 400 || status === 404) {
        const message = httpFailureMessage(err);
        if (message !== undefined) {
          setFormError(message);
          return;
        }
      }
      toast.error('Failed to set next action');
    },
  });

  if (!prompt) {
    return null;
  }

  const openTasks = openTasksData?.tasks ?? [];
  const namedLists = listsData?.lists ?? [];
  const members = membersQuery.data?.members ?? [];

  const submit = (body: { taskId: string } | { newTask: NewNextActionTask }) => {
    setFormError(null);
    setMutation.mutate({
      id: prompt.projectId,
      ...body,
    });
  };

  return (
    <NextActionPicker
      open
      whatsNext
      onOpenChange={(open) => {
        if (!open) {
          dismissWhatsNext();
          setPrompt(null);
        }
      }}
      title="What’s next?"
      description={`Pick the next action for ${prompt.projectName}, add a new task, or skip.`}
      testId="whats-next-picker"
      openTasks={openTasks}
      excludeTaskId={prompt.completedTaskId}
      lists={namedLists.map((list) => ({ id: list.id, name: list.name }))}
      members={members.map((member) => ({
        userId: member.userId,
        label: memberLabel(member),
      }))}
      isPending={setMutation.isPending}
      error={formError}
      onPickTask={(taskId) => submit({ taskId })}
      onCreateTask={(newTask) => submit({ newTask })}
      extraActions={
        <Button
          type="button"
          variant="ghost"
          data-whats-next-skip=""
          onClick={() => {
            dismissWhatsNext();
            setPrompt(null);
          }}
        >
          Skip
        </Button>
      }
    />
  );
}
