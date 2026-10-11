import type { Task } from '@yoink/api-contracts';
import { AnimatedList, AnimatedListItem } from '@/components/animated-list';
import { TaskCard } from '@/components/task-card';

type NowSectionProps = {
  name: 'next-actions' | 'due';
  title: string;
  emptyMessage: string;
  rows: Array<{
    task: Task;
    projectLabel?: string;
    ownerLabel?: string;
  }>;
  onComplete: (id: string) => void;
  onEdit: (task: Task) => void;
  isLoading: boolean;
};

export function NowSection({
  name,
  title,
  emptyMessage,
  rows,
  onComplete,
  onEdit,
  isLoading,
}: NowSectionProps) {
  return (
    <section data-now-section={name} className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span>
          {title} · {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <AnimatedList>
          {rows.map((row) => (
            <AnimatedListItem key={row.task.id} id={row.task.id}>
              <div
                data-now-row={row.task.id}
                data-now-row-project={row.projectLabel ?? ''}
                data-now-row-owner={row.ownerLabel ?? ''}
              >
                <TaskCard
                  task={row.task}
                  onComplete={onComplete}
                  onUncomplete={() => undefined}
                  onEdit={onEdit}
                  isLoading={isLoading}
                  projectLabel={row.projectLabel}
                  assigneeLabel={row.ownerLabel}
                />
              </div>
            </AnimatedListItem>
          ))}
        </AnimatedList>
      )}
    </section>
  );
}
