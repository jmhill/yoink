import { err, ok } from 'neverthrow';
import { storageFailure, type FakeParticipant } from '../../../kernel/unit-of-work.js';
import { isSignupPlan } from '../../domain/signup-plan.js';

const normalizedEmail = (email: string): string => email.trim().toLowerCase();

/**
 * In-memory signup participant. A normalized email already in `emails` is
 * Conflict and writes nothing. Snapshot restores that set.
 */
export const createFakeSignupParticipant = (
  emails: Set<string> = new Set()
): FakeParticipant<unknown> => ({
  owner: 'access',
  apply: (plan) => {
    if (!isSignupPlan(plan)) {
      return err(storageFailure(['access'], 'not-a-signup-plan'));
    }
    const email = normalizedEmail(plan.user.email);
    if (emails.has(email)) {
      return err({ kind: 'Conflict', owner: 'access', reason: 'guard-miss' });
    }
    emails.add(email);
    return ok(undefined);
  },
  snapshot: () => {
    const saved = new Set(emails);
    return () => {
      emails.clear();
      for (const email of saved) {
        emails.add(email);
      }
    };
  },
});
