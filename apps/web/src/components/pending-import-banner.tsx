import { Link } from '@tanstack/react-router';
import { tsrProjects } from '@/api/client';

export function PendingImportBanner() {
  const { data } = tsrProjects.listImports.useQuery({
    queryKey: ['project-imports'],
    queryData: {},
  });
  const pending = data?.status === 200 ? data.body.imports[0] : undefined;
  if (!pending) {
    return null;
  }

  const count = pending.preview?.totals.projectCount;
  const summary =
    count === undefined
      ? `${pending.createdByName} staged an import.`
      : `${pending.createdByName} staged an import of ${count} project${count === 1 ? '' : 's'}.`;

  return (
    <div
      data-pending-import-banner=""
      className="border-b border-warning-border bg-warning-muted px-4 py-2 text-sm text-warning"
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <p className="min-w-0">{summary}</p>
        <Link
          to="/projects/imports/$importId"
          params={{ importId: pending.id }}
          data-import-review=""
          className="shrink-0 font-semibold underline underline-offset-2"
        >
          Review
        </Link>
      </div>
    </div>
  );
}
