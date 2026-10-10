import { createFileRoute, Link } from '@tanstack/react-router';
import { Header } from '@/components/header';
import { tsrProjects } from '@/api/client';
import { PILE_SAFETY_CAP } from '@yoink/api-contracts';
import { ErrorState } from '@/components/error-state';
import { isBlockingQueryFailure } from '@/lib/live-query';

export const Route = createFileRoute('/_authenticated/projects')({
  component: ProjectsPage,
});

function ProjectsPage() {
  const { data, error, isPending, refetch } = tsrProjects.list.useQuery({
    queryKey: ['projects'],
    queryData: { query: { limit: PILE_SAFETY_CAP } },
    refetchInterval: false,
  });

  if (isBlockingQueryFailure(error, data) && error) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  const projects = data?.status === 200 ? data.body.projects : [];

  return (
    <div className="container mx-auto max-w-2xl p-4">
      <Header />
      <h1 className="text-2xl font-bold">Projects</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isPending ? 'Loading…' : `${projects.length} project${projects.length === 1 ? '' : 's'}`}
      </p>
      <ul className="mt-6 space-y-2" data-projects-index="">
        {projects.map((project) => (
          <li key={project.id}>
            <Link
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              data-project-index-item={project.id}
              className="flex min-w-0 flex-col rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <span className="font-medium">{project.name}</span>
              <span className="text-xs capitalize text-muted-foreground">{project.status}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
