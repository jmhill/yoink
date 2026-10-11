import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Header } from '@/components/header';
import { ErrorState } from '@/components/error-state';
import { tsrProjects } from '@/api/client';
import { Button } from '@yoink/ui-base/components/button';
import { isBlockingQueryFailure, invalidateLiveQueries } from '@/lib/live-query';
import { toast } from 'sonner';
import { isFetchError } from '@ts-rest/react-query/v5';
import { projectContract } from '@yoink/api-contracts';

export const Route = createFileRoute('/_authenticated/projects_/imports/$importId')({
  component: ImportPreviewPage,
});

function ImportPreviewPage() {
  const { importId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = tsrProjects.useQueryClient();
  const { data, error, isPending, refetch } = tsrProjects.getImport.useQuery({
    queryKey: ['project-imports', importId],
    queryData: { params: { id: importId } },
  });

  const applyMutation = tsrProjects.applyImport.useMutation({
    onSuccess: async (result) => {
      if (result.status !== 200) return;
      toast.success('Projects imported');
      await queryClient.invalidateQueries({ queryKey: ['project-imports'] });
      await invalidateLiveQueries(queryClient);
      await navigate({ to: '/projects' });
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      if (typeof err === 'object' && err !== null && 'status' in err && 'body' in err) {
        const status = err.status;
        if (status === 400 || status === 403 || status === 404 || status === 409) {
          const parsed = projectContract.applyImport.responses[status].safeParse(err.body);
          if (parsed.success) {
            toast.error(parsed.data.message);
            if (status === 400) {
              void queryClient.invalidateQueries({ queryKey: ['project-imports'] });
            }
            return;
          }
        }
      }
      toast.error('Failed to import projects');
    },
  });

  const discardMutation = tsrProjects.discardImport.useMutation({
    onSuccess: async (result) => {
      if (result.status !== 200) return;
      toast.success('Import discarded');
      await queryClient.invalidateQueries({ queryKey: ['project-imports'] });
      await navigate({ to: '/projects' });
    },
    onError: (err) => {
      if (isFetchError(err)) {
        toast.error('Network error. Please check your connection.');
        return;
      }
      if (typeof err === 'object' && err !== null && 'status' in err && 'body' in err) {
        const status = err.status;
        if (status === 403 || status === 404 || status === 409) {
          const parsed = projectContract.discardImport.responses[status].safeParse(err.body);
          if (parsed.success) {
            toast.error(parsed.data.message);
            return;
          }
        }
      }
      toast.error('Failed to discard import');
    },
  });

  if (isBlockingQueryFailure(error, data) && error) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  const staged = data?.status === 200 ? data.body : undefined;
  const preview = staged?.preview;
  const errors = staged?.errors ?? [];
  const count = preview?.totals.projectCount ?? 0;
  const busy = applyMutation.isPending || discardMutation.isPending;
  const canDecide = staged?.status === 'pending';

  return (
    <div className="container mx-auto max-w-2xl p-4">
      <Header />
      <h1 className="text-2xl font-bold">Import preview</h1>
      {isPending || !staged ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          {staged.createdByName} staged this import
        </p>
      )}

      {errors.length > 0 ? (
        <ul className="mt-4 space-y-2" data-import-errors="">
          {errors.map((item) => (
            <li
              key={`${item.index}-${item.field}-${item.code}`}
              data-import-error={item.index}
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {item.name || 'Untitled'} ({item.field}): {item.message}
            </li>
          ))}
        </ul>
      ) : null}

      {preview ? (
        <div className="mt-6 space-y-4" data-import-preview="">
          <p className="text-sm text-muted-foreground">
            {preview.totals.projectCount} projects · {preview.totals.existingTaskCount} existing
            tasks · {preview.totals.newTaskCount} new tasks ·{' '}
            {preview.totals.projectsWithNoNextAction} with no next action
          </p>
          {preview.projects.map((project, index) => (
            <section
              key={`${project.name}-${index}`}
              data-import-preview-project={index}
              className="rounded-xl border border-border bg-card p-4"
            >
              <h2 className="font-semibold">{project.name}</h2>
              {project.objective ? (
                <p className="mt-1 text-sm">{project.objective}</p>
              ) : null}
              <p className="mt-2 text-sm capitalize text-muted-foreground">{project.status}</p>
              {project.status === 'waiting' ? (
                <p className="text-sm text-muted-foreground">
                  Waiting on {project.waitingOn} · since {project.waitingSince ?? 'unknown'}
                </p>
              ) : null}
              <p className="mt-2 text-sm">
                Next action: {project.nextActionTitle ?? 'none'}
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {project.tasks.map((task) => (
                  <li key={`${task.source}-${task.title}`}>
                    {task.title}{' '}
                    <span className="text-muted-foreground">({task.source})</span>
                  </li>
                ))}
              </ul>
              {project.notebookPages.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {project.notebookPages.map((page) => (
                    <li key={page.path}>
                      <a href={page.url} className="underline underline-offset-2">
                        {page.path}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              {project.warnings.map((warning) => (
                <p
                  key={`${warning.field}-${warning.code}`}
                  data-import-warning={warning.field}
                  className="mt-2 text-sm text-warning"
                >
                  {warning.message}
                </p>
              ))}
            </section>
          ))}
        </div>
      ) : null}

      {canDecide ? (
        <div className="mt-6 flex flex-wrap gap-2 pb-8">
          {count > 0 && errors.length === 0 ? (
            <Button
              type="button"
              data-import-submit=""
              disabled={busy || !preview}
              onClick={() =>
                applyMutation.mutate({
                  params: { id: importId },
                  body: {},
                })
              }
            >
              {applyMutation.isPending
                ? 'Importing…'
                : `Import ${count} project${count === 1 ? '' : 's'}`}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            data-import-discard=""
            disabled={busy}
            onClick={() =>
              discardMutation.mutate({
                params: { id: importId },
                body: {},
              })
            }
          >
            {discardMutation.isPending ? 'Discarding…' : 'Discard'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
