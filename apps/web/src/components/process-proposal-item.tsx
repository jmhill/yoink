import { Button } from '@yoink/ui-base/components/button';
import { Card } from '@yoink/ui-base/components/card';
import type { Project } from '@yoink/api-contracts';
import { CAPTURE_SNIPPET_CARD_CLASS } from '@/components/capture-snippet';
import { proposedByLine } from '@/lib/proposal-copy';
import { cn } from '@yoink/ui-base/lib/utils';
import { useDesktopLayout } from '@/lib/use-desktop-layout';

type ProcessProposalItemProps = {
  project: Project;
  proposerName: string;
  onConfirm: (project: Project) => void;
  onEdit: (project: Project) => void;
  onTurnDown: (project: Project) => void;
  disabled?: boolean;
};

export function ProcessProposalItem({
  project,
  proposerName,
  onConfirm,
  onEdit,
  onTurnDown,
  disabled = false,
}: ProcessProposalItemProps) {
  const showHints = useDesktopLayout();
  const actionSize = showHints ? 'sm' : 'default';

  return (
    <Card
      data-project-id={project.id}
      data-process-item-kind="proposal"
      className={CAPTURE_SNIPPET_CARD_CLASS}
    >
      <div className="space-y-2 px-3 pt-3">
        <h2 data-process-proposal-name="" className="text-base font-semibold leading-6">
          {project.name}
        </h2>
        {project.objective ? (
          <p data-process-proposal-objective="" className="text-sm leading-6">
            {project.objective}
          </p>
        ) : null}
        <p data-process-proposal-meta="" className="text-sm text-muted-foreground">
          {proposedByLine({ proposerName, createdAt: project.createdAt })}
        </p>
        {project.reason ? (
          <p data-process-proposal-reason="" className="text-sm text-muted-foreground">
            {project.reason}
          </p>
        ) : null}
        {project.suggestedNextAction ? (
          <p data-process-proposal-next="" className="text-sm">
            Suggested next: {project.suggestedNextAction}
          </p>
        ) : null}
      </div>
      <div className={cn('flex flex-wrap gap-2 px-3 pb-3 pt-3', showHints && 'gap-1')}>
        <Button
          type="button"
          variant="outline"
          size={actionSize}
          className={showHints ? 'px-2' : undefined}
          data-process-proposal-confirm=""
          disabled={disabled}
          onClick={() => onConfirm(project)}
        >
          Confirm
        </Button>
        <Button
          type="button"
          variant="outline"
          size={actionSize}
          className={showHints ? 'px-2' : undefined}
          data-process-proposal-edit=""
          disabled={disabled}
          onClick={() => onEdit(project)}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="outline"
          size={actionSize}
          className={showHints ? 'px-2' : undefined}
          data-process-proposal-decline=""
          disabled={disabled}
          onClick={() => onTurnDown(project)}
        >
          Turn down
        </Button>
      </div>
    </Card>
  );
}
