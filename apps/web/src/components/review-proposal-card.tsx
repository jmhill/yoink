import { Link } from '@tanstack/react-router';
import { Button } from '@yoink/ui-base/components/button';
import type { Project } from '@yoink/api-contracts';
import { proposedByLine } from '@/lib/proposal-copy';

type ReviewProposalCardProps = {
  project: Project;
  proposerName: string;
  onConfirm: (project: Project) => void;
  onTurnDown: (project: Project) => void;
  disabled?: boolean;
};

export function ReviewProposalCard({
  project,
  proposerName,
  onConfirm,
  onTurnDown,
  disabled = false,
}: ReviewProposalCardProps) {
  return (
    <li data-review-proposal={project.id}>
      <div className="space-y-2 rounded-md border border-border px-3 py-2">
        <Link
          to="/projects/$projectId"
          params={{ projectId: project.id }}
          data-review-proposal-open=""
          className="block space-y-1 text-sm hover:underline"
        >
          <span data-review-proposal-name="" className="block font-medium text-foreground">
            {project.name}
          </span>
          <span data-review-proposal-meta="" className="block text-muted-foreground no-underline">
            {proposedByLine({ proposerName, createdAt: project.createdAt })}
          </span>
          {project.reason ? (
            <span data-review-proposal-reason="" className="block text-muted-foreground no-underline">
              {project.reason}
            </span>
          ) : null}
          {project.suggestedNextAction ? (
            <span data-review-proposal-next="" className="block no-underline">
              Suggested next: {project.suggestedNextAction}
            </span>
          ) : null}
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            data-review-proposal-confirm=""
            disabled={disabled}
            onClick={() => onConfirm(project)}
          >
            Confirm
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-review-proposal-decline=""
            disabled={disabled}
            onClick={() => onTurnDown(project)}
          >
            Turn down
          </Button>
        </div>
      </div>
    </li>
  );
}
