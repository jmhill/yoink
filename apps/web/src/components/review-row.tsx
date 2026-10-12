import { Link } from '@tanstack/react-router';
import type { ReviewProject } from '@yoink/api-contracts';
import { Button } from '@yoink/ui-base/components/button';
import { formatLastChangeLine, formatWaitingRowCopy } from '@/lib/review-copy';
import { reviewSectionOf } from '@/lib/review-sections';
import { showsNoNextActionWarning } from '@/lib/project-next-action';

type ReviewRowProps = {
  item: ReviewProject;
  today: string;
  timeZone: string;
  onSetNextAction?: (item: ReviewProject) => void;
  onChangeStatus?: (item: ReviewProject) => void;
};

export function ReviewRow({
  item,
  today,
  timeZone,
  onSetNextAction,
  onChangeStatus,
}: ReviewRowProps) {
  const section = reviewSectionOf(item);
  const copy =
    section === 'waiting'
      ? formatWaitingRowCopy(item, today)
      : section === 'quiet'
        ? formatLastChangeLine(item, timeZone)
        : null;
  const showNoNextChip = showsNoNextActionWarning(item.project);

  return (
    <li>
      <div
        data-review-item={item.project.id}
        data-review-reasons={item.reasons.join(',')}
        className="flex min-w-0 flex-col gap-2 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center"
      >
        <Link
          to="/projects/$projectId"
          params={{ projectId: item.project.id }}
          data-project-index-item={item.project.id}
          className="min-w-0 flex-1 text-sm hover:underline"
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{item.project.name}</span>
            {showNoNextChip ? (
              <span
                data-project-no-next-action=""
                className="rounded-full border border-warning-border bg-warning-muted px-2 py-0.5 text-[11px] font-semibold text-warning"
              >
                No next action
              </span>
            ) : null}
          </span>
          {copy ? (
            <span data-review-row-copy="" className="mt-0.5 block text-xs text-muted-foreground">
              {copy}
            </span>
          ) : null}
          {item.nextAction ? (
            <span data-review-next-action="" className="mt-0.5 block text-xs text-muted-foreground">
              {item.nextAction.title}
            </span>
          ) : null}
        </Link>
        <div className="flex shrink-0 flex-wrap gap-2">
          {onSetNextAction ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-review-set-next={item.project.id}
              onClick={() => onSetNextAction(item)}
            >
              Set next action
            </Button>
          ) : null}
          {onChangeStatus ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-review-change-status={item.project.id}
              onClick={() => onChangeStatus(item)}
            >
              Change status
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
