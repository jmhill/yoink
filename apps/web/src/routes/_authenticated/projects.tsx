import { useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@yoink/ui-base/components/button';
import { Header } from '@/components/header';
import { CreateProjectDialog } from '@/components/create-project-dialog';
import { tsrProjects } from '@/api/client';
import { PILE_SAFETY_CAP } from '@yoink/api-contracts';
import { ErrorState } from '@/components/error-state';
import { isBlockingQueryFailure } from '@/lib/live-query';
import { showsNoNextActionWarning } from '@/lib/project-next-action';

export const Route = createFileRoute('/_authenticated/projects')({
  component: ProjectsPage,
});

function ProjectsPage() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const { data, error, isPending, refetch } = tsrProjects.list.useQuery({
    queryKey: ['projects'],
    queryData: { query: { limit: PILE_SAFETY_CAP } },
    refetchInterval: false,
  });

  if (isBlockingQueryFailure(error, data) && error) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  const projects = data?.status === 200 ? data.body.projects : [];
  const ready = data?.status === 200;

  return (
    <div
      data-review-ready={ready ? '' : undefined}
      className="container mx-auto max-w-2xl p-4"
    >
      <Header />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isPending ? 'Loading…' : `${projects.length} project${projects.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          data-review-new-project=""
          onClick={() => setCreateOpen(true)}
        >
          + New project
        </Button>
      </div>
      <ul className="mt-6 space-y-2" data-projects-index="">
        {projects.map((project) => (
          <li key={project.id}>
            <Link
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              data-project-index-item={project.id}
              className="flex min-w-0 flex-col rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <span className="flex items-center gap-2">
                <span className="font-medium">{project.name}</span>
                {showsNoNextActionWarning(project) ? (
                  <span
                    data-project-no-next-action=""
                    className="rounded-full border border-warning-border bg-warning-muted px-2 py-0.5 text-[11px] font-semibold text-warning"
                  >
                    No next action
                  </span>
                ) : null}
              </span>
              <span
                className="text-xs capitalize text-muted-foreground"
                data-project-index-status={project.status}
              >
                {project.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(project) => {
          void navigate({
            to: '/projects/$projectId',
            params: { projectId: project.id },
          });
        }}
      />
    </div>
  );
}
