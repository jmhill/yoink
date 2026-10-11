import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { Header } from '@/components/header';
import { ErrorState } from '@/components/error-state';
import { tsrProjects } from '@/api/client';
import { Button } from '@yoink/ui-base/components/button';
import { cn } from '@yoink/ui-base/lib/utils';
import { isBlockingQueryFailure, invalidateLiveQueries } from '@/lib/live-query';
import { toast } from 'sonner';
import { isFetchError } from '@ts-rest/react-query/v5';
import {
  projectContract,
  type ImportEntryError,
  type ImportPreviewProject,
} from '@yoink/api-contracts';
import { formatImportPreviewSummary } from '@/lib/import-preview-summary';
import { formatImportPreviewError } from '@/lib/format-import-preview-error';
import { formatImportPreviewTaskLine } from '@/lib/format-import-preview-task';

export const Route = createFileRoute('/_authenticated/projects_/imports/$importId')({
  component: ImportPreviewPage,
});

const statusLabel = (status: ImportPreviewProject['status']): string => {
  if (status === 'active') return 'Active';
  if (status === 'waiting') return 'Waiting';
  return 'Someday';
};

const taskCountLabel = (count: number): string =>
  `${count} task${count === 1 ? '' : 's'}`;

const errorsForIndex = (
  errors: ImportEntryError[],
  index: number
): ImportEntryError[] => errors.filter((item) => item.index === index);

function ImportPreviewProjectCard(props: {
  index: number;
  project: ImportPreviewProject;
  errors: ImportEntryError[];
  open: boolean;
  onToggle: () => void;
}) {
  const { project, errors, open, onToggle } = props;
  const tone = errors.length > 0 ? 'error' : project.warnings.length > 0 ? 'warning' : null;
  const nextAction = project.nextActionTitle ?? 'No next action';

  return (
    <section
      data-import-preview-project={props.index}
      data-import-preview-open={open ? 'true' : 'false'}
      className="rounded-xl border border-border bg-card"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
        onClick={onToggle}
      >
        {tone === 'warning' ? (
          <span
            data-import-preview-marker="warning"
            className="size-1.5 shrink-0 rounded-full bg-warning"
          />
        ) : null}
        {tone === 'error' ? (
          <span
            data-import-preview-marker="error"
            className="size-1.5 shrink-0 rounded-full bg-destructive"
          />
        ) : null}
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">{project.name}</span>
          <span className="text-muted-foreground">
            {' · '}
            {statusLabel(project.status)}
            {' · '}
            {nextAction}
            {' · '}
            {taskCountLabel(project.tasks.length)}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border px-4 py-3" data-import-preview-detail="">
          {project.objective ? (
            <p className="text-sm">{project.objective}</p>
          ) : null}
          {project.status === 'waiting' ? (
            <p className="text-sm text-muted-foreground">
              Waiting on {project.waitingOn} · since {project.waitingSince ?? 'unknown'}
            </p>
          ) : null}
          <ul className="space-y-1 text-sm">
            {project.tasks.map((task) => (
              <li key={`${task.source}-${task.title}`}>{formatImportPreviewTaskLine(task)}</li>
            ))}
          </ul>
          {project.notebookPages.length > 0 ? (
            <ul className="space-y-1 text-sm">
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
              className="text-sm text-warning"
            >
              {warning.message}
            </p>
          ))}
          {errors.map((item) => (
            <p
              key={`${item.field}-${item.code}`}
              data-import-error={item.index}
              className="text-sm text-destructive"
            >
              {formatImportPreviewError(item)}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ImportPreviewPage() {
  const { importId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = tsrProjects.useQueryClient();
  const { data, error, isPending, refetch } = tsrProjects.getImport.useQuery({
    queryKey: ['project-imports', importId],
    queryData: { params: { id: importId } },
  });
  const [toggled, setToggled] = useState<Record<number, boolean>>({});

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
  const warningCount =
    preview?.projects.reduce((sum, project) => sum + project.warnings.length, 0) ?? 0;
  const busy = applyMutation.isPending || discardMutation.isPending;
  const canDecide = staged?.status === 'pending';
  const isOpen = (index: number, project: ImportPreviewProject): boolean => {
    if (toggled[index] !== undefined) {
      return toggled[index];
    }
    return project.warnings.length > 0 || errorsForIndex(errors, index).length > 0;
  };

  return (
    <div className="container mx-auto max-w-2xl p-4 pb-36 md:pb-24">
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
              {formatImportPreviewError(item)}
            </li>
          ))}
        </ul>
      ) : null}

      {preview ? (
        <div className="mt-6 space-y-3" data-import-preview="">
          <p className="text-sm text-muted-foreground" data-import-preview-summary="">
            {formatImportPreviewSummary({
              projectCount: preview.totals.projectCount,
              existingTaskCount: preview.totals.existingTaskCount,
              newTaskCount: preview.totals.newTaskCount,
              warningCount,
            })}
          </p>
          {preview.projects.map((project, index) => (
            <ImportPreviewProjectCard
              key={`${project.name}-${index}`}
              index={index}
              project={project}
              errors={errorsForIndex(errors, index)}
              open={isOpen(index, project)}
              onToggle={() => {
                setToggled((current) => ({
                  ...current,
                  [index]: !isOpen(index, project),
                }));
              }}
            />
          ))}
        </div>
      ) : null}

      {canDecide ? (
        <div
          data-import-actions=""
          className="fixed inset-x-0 bottom-16 z-40 border-t bg-background px-4 py-3 md:bottom-0"
        >
          <div className="container mx-auto flex max-w-2xl flex-wrap gap-2">
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
        </div>
      ) : null}
    </div>
  );
}
