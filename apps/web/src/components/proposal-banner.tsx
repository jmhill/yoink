import { Button } from '@yoink/ui-base/components/button';
import type { Project } from '@yoink/api-contracts';
import { proposedByLine } from '@/lib/proposal-copy';

type ProposalBannerProps = {
  project: Project;
  proposerName: string;
  onConfirm: () => void;
  onTurnDown: () => void;
  disabled?: boolean;
};

export function ProposalBanner({
  project,
  proposerName,
  onConfirm,
  onTurnDown,
  disabled = false,
}: ProposalBannerProps) {
  return (
    <div
      data-proposal-banner=""
      className="space-y-3 rounded-xl border border-border bg-muted px-4 py-3"
    >
      <div className="space-y-1">
        <p data-proposal-banner-meta="" className="text-sm font-medium">
          {proposedByLine({ proposerName, createdAt: project.createdAt })}
        </p>
        {project.reason ? (
          <p data-proposal-banner-reason="" className="text-sm text-muted-foreground">
            {project.reason}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          data-proposal-banner-confirm=""
          disabled={disabled}
          onClick={onConfirm}
        >
          Confirm
        </Button>
        <Button
          type="button"
          variant="outline"
          data-proposal-banner-decline=""
          disabled={disabled}
          onClick={onTurnDown}
        >
          Turn down
        </Button>
      </div>
    </div>
  );
}
