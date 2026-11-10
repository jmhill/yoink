import type { User } from './user.js';

/**
 * One user insert this service owns. The access participant compiles it.
 * The unit of work does not inspect it. `create-user` is not signup's
 * guarded user insert, admin's `create-member`, or `mint-agent`. Get,
 * get-by-email, and get-by-ids stay reads.
 */
export type CreateUserPlan = {
  readonly kind: 'create-user';
  readonly user: User;
};

export type UserPlan = CreateUserPlan;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isCreateUserPlan = (plan: unknown): plan is CreateUserPlan => {
  if (!isRecord(plan) || plan.kind !== 'create-user' || !isRecord(plan.user)) {
    return false;
  }
  if (
    typeof plan.user.id !== 'string' ||
    typeof plan.user.email !== 'string' ||
    typeof plan.user.createdAt !== 'string'
  ) {
    return false;
  }
  if (plan.user.name !== undefined && typeof plan.user.name !== 'string') {
    return false;
  }
  if (
    plan.user.kind !== undefined &&
    plan.user.kind !== 'human' &&
    plan.user.kind !== 'agent'
  ) {
    return false;
  }
  return true;
};
