import { err, ok, type Result } from 'neverthrow';
import {
  storageFailure,
  type FakeParticipant,
  type StepFailure,
} from '../../../../kernel/unit-of-work.js';
import type { CapturePlan } from '../../domain/projections/plan-capture.js';
import type { FakeCaptureStore } from './fake-capture-store.js';

const rejected = (): Result<void, StepFailure> =>
  err(storageFailure(['captures'], 'plan-rejected'));

const isPlan = (plan: unknown): plan is CapturePlan =>
  typeof plan === 'object' &&
  plan !== null &&
  'writes' in plan &&
  Array.isArray(plan.writes);

/** Snapshot is the store's copy. The unit of work restores it. Processing still calls the store directly until M5.5. */
export const createFakeCaptureParticipant = (
  store: FakeCaptureStore
): FakeParticipant<unknown> => ({
  owner: 'captures',
  snapshot: () => store.captureSnapshot(),
  apply: (plan) => {
    if (!isPlan(plan)) {
      return rejected();
    }
    const applied = store.applyPlan(plan);
    return applied.isOk() ? ok(undefined) : applied;
  },
});
