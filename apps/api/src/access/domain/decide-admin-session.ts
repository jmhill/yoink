import { err, ok, type Result } from 'neverthrow';
import type { AdminSession } from './admin-session.js';
import {
  expiredAdminSessionError,
  invalidAdminPasswordError,
  invalidAdminSessionError,
  type ExpiredAdminSessionError,
  type InvalidAdminPasswordError,
  type InvalidAdminSessionError,
} from './admin-session-errors.js';
import { planAdminSession, type IssueAdminSessionPlan } from './admin-session-plan.js';

export type DecideAdminLoginInput = {
  readonly passwordMatches: boolean;
  readonly now: string;
  readonly sessionId?: string;
};

/** The digest comparison already happened. A miss is not a session. */
export const decideAdminLogin = (
  input: DecideAdminLoginInput
): Result<IssueAdminSessionPlan, InvalidAdminPasswordError> => {
  if (!input.passwordMatches) {
    return err(invalidAdminPasswordError());
  }
  return ok(
    planAdminSession({
      now: input.now,
      ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    })
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export type DecideAdminSessionInput = {
  readonly candidate: unknown;
  readonly nowMs: number;
  readonly ttlMs: number;
};

/**
 * Structure and expiry only. The signature was checked before this runs.
 * An unparseable `createdAt` stays valid: `NaN > ttl` is false, which is
 * what the previous service did.
 */
export const decideAdminSession = (
  input: DecideAdminSessionInput
): Result<AdminSession, InvalidAdminSessionError | ExpiredAdminSessionError> => {
  const { candidate } = input;
  if (!isRecord(candidate) || candidate.isAdmin !== true || typeof candidate.createdAt !== 'string') {
    return err(invalidAdminSessionError());
  }
  const createdAt = new Date(candidate.createdAt).getTime();
  if (input.nowMs - createdAt > input.ttlMs) {
    return err(expiredAdminSessionError());
  }
  return ok(candidate as AdminSession);
};
