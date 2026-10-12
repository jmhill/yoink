import { Link } from '@tanstack/react-router';
import type { Project } from '@yoink/api-contracts';
import { Button } from '@yoink/ui-base/components/button';
import { showsNoNextActionWarning } from '@/lib/project-next-action';

type ReviewAllProjectsProps = {
  projects: readonly Project[];
  onNewProject: () => void;
};

export function ReviewAllProjects({ projects, onNewProject }: ReviewAllProjectsProps) {
  return (
    <div className="mt-8 space-y-3">
      <details data-review-all-projects="" className="rounded-md border border-border">
        <summary
          data-review-all-projects-summary=""
          className="cursor-pointer px-3 py-2 text-sm font-medium"
        >
          All projects ({projects.length})
        </summary>
        <ul className="space-y-2 border-t border-border p-3" data-projects-index="">
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

export function ReviewDoneThisWeekSlot() {
  return null;
}
