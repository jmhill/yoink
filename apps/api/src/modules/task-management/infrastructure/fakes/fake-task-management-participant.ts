import { err, ok, type Result } from 'neverthrow';
import {
  storageFailure,
  type FakeParticipant,
  type StepFailure,
} from '../../../../kernel/unit-of-work.js';

const STEP_TYPES = new Set(['task', 'project', 'list', 'import-apply', 'import-discard']);

const isStep = (plan: unknown): boolean =>
  typeof plan === 'object' &&
  plan !== null &&
  'type' in plan &&
  typeof plan.type === 'string' &&
  STEP_TYPES.has(plan.type);

/** Shape check only. The in-memory unit of work does not apply the writes. */
export const createFakeTaskManagementParticipant = (): FakeParticipant<unknown> => ({
  owner: 'task-management',
  snapshot: () => () => undefined,
  apply: (plan): Result<void, StepFailure> => {
    if (!isStep(plan)) {
      return err(storageFailure(['task-management'], 'plan-rejected'));
    }
    return ok(undefined);
  },
});
