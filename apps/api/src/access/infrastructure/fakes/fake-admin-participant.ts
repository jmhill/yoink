import { err, ok } from 'neverthrow';
import { storageFailure, type FakeParticipant } from '../../../kernel/unit-of-work.js';
import { isAdminPlan, type AdminPlan } from '../../domain/admin-plan.js';

export type FakeAdminState = {
  readonly userIds: Set<string>;
  readonly applied: AdminPlan[];
};

/**
 * In-memory admin participant. A rename of an unknown user is Conflict and
 * writes nothing. Other plans are recorded. Snapshot restores both.
 */
export const createFakeAdminParticipant = (
  state: FakeAdminState = { userIds: new Set(), applied: [] }
): FakeParticipant<unknown> => ({
  owner: 'access',
  apply: (plan) => {
    if (!isAdminPlan(plan)) {
      return err(storageFailure(['access'], 'not-an-admin-plan'));
    }
    if (plan.kind === 'rename-user' && !state.userIds.has(plan.userId)) {
      return err({ kind: 'Conflict', owner: 'access', reason: 'guard-miss' });
    }
    if (plan.kind === 'create-member') {
      state.userIds.add(plan.user.id);
    }
    state.applied.push(plan);
    return ok(undefined);
  },
  snapshot: () => {
    const userIds = new Set(state.userIds);
    const applied = [...state.applied];
    return () => {
      state.userIds.clear();
      for (const id of userIds) {
        state.userIds.add(id);
      }
      state.applied.splice(0, state.applied.length, ...applied);
    };
  },
});
