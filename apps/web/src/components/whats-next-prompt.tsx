import { useEffect, useState } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { PILE_SAFETY_CAP, projectContract } from '@yoink/api-contracts';
import { isFetchError } from '@ts-rest/react-query/v5';
import { toast } from 'sonner';
import { tsrLists, tsrOrganizations, tsrAuth, tsrProjects } from '@/api/client';
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
  const queryClient = tsrProjects.useQueryClient();

  useEffect(() => subscribeWhatsNext(setPrompt), []);

  const { data: openTasksData } = tsrProjects.listOpenTasks.useQuery({
    queryKey: ['tasks', 'project', prompt?.projectId ?? ''],
    queryData: {
      params: { id: prompt?.projectId ?? '' },
      query: { limit: PILE_SAFETY_CAP },
    },
    enabled: Boolean(prompt?.projectId),
  });

  const { data: listsData } = tsrLists.list.useQuery({
    queryKey: ['lists'],
    queryData: { query: { limit: PILE_SAFETY_CAP } },
    refetchInterval: false,
    enabled: Boolean(prompt),
  });

  const { data: sessionData } = tsrAuth.session.useQuery({
    queryKey: ['session'],
    queryData: {},
    refetchInterval: false,
    enabled: Boolean(prompt),
  });
  const organizationId = sessionData?.status === 200 ? sessionData.body.organizationId : undefined;

  const membersQuery = tsrOrganizations.listMembers.useQuery({
    queryKey: ['organization-members', organizationId ?? ''],
    queryData: { params: { organizationId: organizationId ?? '' } },
    enabled: Boolean(prompt && organizationId),
    refetchInterval: false,
  });

  const setMutation = tsrProjects.setNextAction.useMutation({
    onSuccess: async (result) => {
      if (result.status !== 200) return;
      setFormError(null);
      toast.success('Next action set');
      dismissWhatsNext();
      setPrompt(null);
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
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
            setFormError(parsed.data.message);
            return;
          }
        }
      }
      toast.error('Failed to set next action');
    },
  });

  if (!prompt) {
    return null;
  }

  const openTasks = openTasksData?.status === 200 ? openTasksData.body.tasks : [];
  const namedLists = listsData?.status === 200 ? listsData.body.lists : [];
  const members = membersQuery.data?.status === 200 ? membersQuery.data.body.members : [];

  const submit = (body: { taskId: string } | { newTask: NewNextActionTask }) => {
    setFormError(null);
    setMutation.mutate({
      params: { id: prompt.projectId },
      body,
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
