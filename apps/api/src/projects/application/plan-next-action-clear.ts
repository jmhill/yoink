import type { Project } from '@yoink/api-contracts';
import type { Actor } from '../../shared/auth-context.js';
import { nextActionClearFor, type NextActionTaskChange } from '../domain/next-action-clear.js';
import { planProjectChange, type ProjectChangePlan } from '../domain/plan-project-change.js';

export const planNextActionClear = (input: {
  project: Project;
  change: NextActionTaskChange;
  actor: Actor;
  now: string;
  recordId: string;
}): ProjectChangePlan | null => {
  const event = nextActionClearFor(input.project, input.change, input.now);
  if (!event) {
    return null;
  }
  return planProjectChange({
    event,
    current: input.project,
    actor: input.actor,
    ids: { recordId: input.recordId },
  });
};
