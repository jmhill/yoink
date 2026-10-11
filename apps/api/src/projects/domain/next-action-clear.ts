import type { ProjectNextActionCleared, ProjectNextActionClearReason } from './events.js';

export type NextActionProject = {
  id: string;
  organizationId: string;
  nextActionTaskId: string | null;
};

export type NextActionTaskChange =
  | { type: 'completed'; taskId: string }
  | { type: 'deleted'; taskId: string }
  | { type: 'removedFromProject'; taskId: string }
  | { type: 'projectDone' };

const reasonFor = (change: NextActionTaskChange): ProjectNextActionClearReason => {
  switch (change.type) {
    case 'completed':
      return 'completed';
    case 'deleted':
      return 'deleted';
    case 'removedFromProject':
      return 'removedFromProject';
    case 'projectDone':
      return 'projectDone';
  }
};

const appliesTo = (nextActionTaskId: string, change: NextActionTaskChange): boolean => {
  if (change.type === 'projectDone') {
    return true;
  }
  return change.taskId === nextActionTaskId;
};

export const nextActionClearFor = (
  project: NextActionProject,
  change: NextActionTaskChange,
  now: string
): ProjectNextActionCleared | null => {
  if (!project.nextActionTaskId) {
    return null;
  }
  if (!appliesTo(project.nextActionTaskId, change)) {
    return null;
  }
  return {
    type: 'ProjectNextActionCleared',
    id: project.id,
    organizationId: project.organizationId,
    taskId: project.nextActionTaskId,
    reason: reasonFor(change),
    occurredAt: now,
  };
};
