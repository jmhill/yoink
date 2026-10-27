import { Link } from '@tanstack/react-router';
import type { DoneListPage, Project } from '@yoink/api-contracts';
import { Button } from '@yoink/ui-base/components/button';
import {
  canSetDoneNextAction,
  doneOtherLine,
  doneVersionOf,
  formatDoneTaskWhen,
  formatDoneWeekRange,
  showsDoneProjectChip,
} from '@/lib/done-list';
import { showsNoNextActionWarning } from '@/lib/project-next-action';
import { proposedByLine } from '@/lib/proposal-copy';

type ReviewAllProjectsProps = {
  projects: readonly Project[];
  proposals: readonly Project[];
  proposerName: (project: Project) => string;
  onNewProject: () => void;
};

export function ReviewAllProjects({
  projects,
  proposals,
  proposerName,
  onNewProject,
}: ReviewAllProjectsProps) {
  const listedCount = projects.length + proposals.length;
  return (
    <div className="mt-8 space-y-3">
      <details data-review-all-projects="" className="rounded-md border border-border">
        <summary
          data-review-all-projects-summary=""
          className="cursor-pointer px-3 py-2 text-sm font-medium"
        >
          All projects ({listedCount})
        </summary>
        <div className="space-y-3 border-t border-border p-3">
          {proposals.length > 0 ? (
            <div data-all-projects-proposed="" className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Proposed
              </h3>
              <ul className="space-y-2">
                {proposals.map((project) => (
                  <li key={project.id}>
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: project.id }}
                      data-all-projects-proposed-item={project.id}
                      data-all-projects-proposed-name={project.name}
                      className="flex min-w-0 flex-col rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                    >
                      <span className="font-medium">{project.name}</span>
                      <span
                        data-all-projects-proposed-by=""
                        className="text-xs text-muted-foreground"
                      >
                        {proposedByLine({
                          proposerName: proposerName(project),
                          createdAt: project.createdAt,
                        })}
                      </span>
                      <span
                        className="text-xs capitalize text-muted-foreground"
                        data-all-projects-proposed-status="proposed"
                      >
                        proposed
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        <ul className="space-y-2" data-projects-index="">
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
        </div>
      </details>
      <Button
        type="button"
        variant="outline"
        data-review-new-project=""
        onClick={onNewProject}
      >
        + New project
      </Button>
    </div>
  );
}

type ReviewDoneThisWeekSlotProps = {
  page: DoneListPage | null;
  onSetNextAction: (project: Project) => void;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
};

export function ReviewDoneThisWeekSlot({
  page,
  onSetNextAction,
  onPreviousWeek,
  onNextWeek,
}: ReviewDoneThisWeekSlotProps) {
  if (page === null) {
    return null;
  }

  return (
    <section
      data-review-section="done"
      data-done-week={page.week.start}
      data-done-version={doneVersionOf(page)}
      className="mt-6 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">Done this week</h2>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-done-prev=""
            aria-label="Previous week"
            onClick={onPreviousWeek}
          >
            ‹
          </Button>
          <span data-done-week-label="" className="min-w-[7rem] text-center text-xs text-muted-foreground">
            {formatDoneWeekRange(page.week.start, page.week.end)}
          </span>
          {page.nextWeek !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-done-next=""
              aria-label="Next week"
              onClick={onNextWeek}
            >
              ›
            </Button>
          ) : (
            <span className="inline-flex h-8 w-8" aria-hidden="true" />
          )}
        </div>
      </div>

      {page.groups.length === 0 ? (
        <p data-done-empty="" className="text-sm text-muted-foreground">
          Nothing finished this week
        </p>
      ) : (
        <ul className="space-y-3">
          {page.groups.map((group) => (
            <li
              key={group.project.id}
              data-done-group={group.project.id}
              data-done-group-next={group.nextAction?.id ?? ''}
              className="space-y-2 rounded-md border border-border px-3 py-2"
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: group.project.id }}
                  className="flex min-w-0 items-center gap-2 text-sm font-medium hover:underline"
                >
                  <span>{group.project.name}</span>
                  {showsDoneProjectChip(group) ? (
                    <span
                      data-done-project-chip=""
                      className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                    >
                      Project done
                    </span>
                  ) : null}
                </Link>
                {canSetDoneNextAction(group) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-done-set-next={group.project.id}
                    onClick={() => onSetNextAction(group.project)}
                  >
                    Set next action
                  </Button>
                ) : group.nextAction !== null && !showsDoneProjectChip(group) ? (
                  <span data-done-next-action="" className="text-xs text-muted-foreground">
                    Next: {group.nextAction.title}
                  </span>
                ) : null}
              </div>
              <ul className="space-y-1">
                {group.tasks.map((task) => (
                  <li key={task.id} data-done-task={task.id} className="text-sm">
                    <span className="block">{task.title}</span>
                    {task.completedAt ? (
                      <span data-done-task-when="" className="text-xs text-muted-foreground">
                        {formatDoneTaskWhen(task.completedAt, page.timeZone, task.completedByName)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {page.otherTaskCount > 0 ? (
        <Link
          to="/tasks"
          search={{ filter: 'completed' }}
          data-done-other=""
          className="block text-sm text-muted-foreground hover:underline"
        >
          {doneOtherLine(page.otherTaskCount)}
        </Link>
      ) : null}
    </section>
  );
}
