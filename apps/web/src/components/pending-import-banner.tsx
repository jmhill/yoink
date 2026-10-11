import { Link } from '@tanstack/react-router';
import { tsrProjects } from '@/api/client';
import { LIVE_QUERY_REFETCH_INTERVAL_MS } from '@/lib/live-query';

export function PendingImportBanner() {
  const { data } = tsrProjects.listImports.useQuery({
    queryKey: ['project-imports'],
    queryData: {},
    refetchInterval: () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return false;
      }
      return LIVE_QUERY_REFETCH_INTERVAL_MS;
    },
  });
  const pending = data?.status === 200 ? data.body.imports : [];
  if (pending.length === 0) {
    return null;
  }

  const newest = pending.reduce((current, item) =>
    item.createdAt >= current.createdAt ? item : current
  );
  const count = newest.preview?.totals.projectCount;
  const summary =
    pending.length > 1
      ? `${pending.length} imports waiting`
      : count === undefined
        ? `${newest.createdByName} staged an import.`
        : `${newest.createdByName} staged an import of ${count} project${count === 1 ? '' : 's'}.`;

  return (
    <div
      data-pending-import-banner=""
      className="border-b border-warning-border bg-warning-muted px-4 py-2 text-sm text-warning"
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <p className="min-w-0">{summary}</p>
        <Link
          to="/projects/imports/$importId"
          params={{ importId: newest.id }}
          data-import-review=""
          className="shrink-0 font-semibold underline underline-offset-2"
        >
          Review
        </Link>
      </div>
    </div>
  );
}
