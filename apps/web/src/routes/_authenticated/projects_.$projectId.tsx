import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { Input } from '@yoink/ui-base/components/input';
import { Label } from '@yoink/ui-base/components/label';
import { Header } from '@/components/header';
import { ErrorState } from '@/components/error-state';
import { tsrProjects } from '@/api/client';
import { projectContract } from '@yoink/api-contracts';
import { isBlockingQueryFailure } from '@/lib/live-query';
import { isFetchError } from '@ts-rest/react-query/v5';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/projects_/$projectId')({
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const queryClient = tsrProjects.useQueryClient();
  const { data, error, isPending, refetch } = tsrProjects.get.useQuery({
    queryKey: ['projects', projectId],
    queryData: { params: { id: projectId } },
    refetchInterval: false,
  });

  const project = data?.status === 200 ? data.body : undefined;
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!project) {
      return;
    }
    setName(project.name);
    setObjective(project.objective ?? '');
  }, [project]);

  const updateMutation = tsrProjects.update.useMutation({
    onSuccess: async (result) => {
      if (result.status !== 200) return;
      setFormError(null);
      toast.success('Project saved');
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      if (typeof err === 'object' && err !== null && 'status' in err && 'body' in err) {
        const status = err.status;
        if (status === 400 || status === 409) {
          const parsed = projectContract.update.responses[status].safeParse(err.body);
          if (parsed.success) {
            setFormError(parsed.data.message);
            return;
          }
        }
      }
      toast.error('Failed to save project');
    },
  });

  if (isBlockingQueryFailure(error, data) && error) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  if (isPending || !project) {
    return (
      <div className="container mx-auto max-w-2xl p-4">
        <Header />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || updateMutation.isPending) {
      if (!trimmedName) {
        setFormError('Name is required');
      }
      return;
    }
    updateMutation.mutate({
      params: { id: projectId },
      body: {
        name: trimmedName,
        objective: objective.trim() === '' ? null : objective.trim(),
      },
    });
  };

  return (
    <div className="container mx-auto max-w-2xl p-4">
      <Header />
      <form data-project-page="" onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="project-page-name">Name</Label>
          <Input
            id="project-page-name"
            data-project-name-input=""
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setFormError(null);
            }}
            maxLength={200}
            disabled={updateMutation.isPending}
          />
        </div>

        <p data-project-status={project.status} className="text-sm capitalize text-muted-foreground">
          Status: {project.status}
        </p>

        <div className="space-y-2">
          <Label htmlFor="project-page-objective">Objective</Label>
          <textarea
            id="project-page-objective"
            data-project-objective-input=""
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            maxLength={2000}
            rows={5}
            disabled={updateMutation.isPending}
            className="border-input dark:bg-input/30 w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
        </div>

        {formError ? (
          <p role="alert" data-project-save-error="" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" data-project-save="" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link to="/projects">All projects</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
