import type { GuardedStatement } from '../../../kernel/unit-of-work.js';
import type { User } from '../../domain/user.js';
import type { UserPlan } from '../../domain/user-plan.js';

const statement = (
  verb: GuardedStatement['verb'],
  sql: string,
  args: readonly unknown[],
  guard: boolean
): GuardedStatement => ({ verb, sql, args, guard });

/**
 * Same insert the user store save uses. A duplicate id or email throws
 * and the batch is Storage. It is not a guard. An omitted kind is stored
 * as human. Signup's user insert stays the guarded one.
 */
const userInsert = (user: User): GuardedStatement =>
  statement(
    'insert',
    `
            INSERT INTO users (id, email, name, kind, created_at)
            VALUES (?, ?, ?, ?, ?)
          `,
    [user.id, user.email, user.name ?? null, user.kind ?? 'human', user.createdAt],
    false
  );

/**
 * User writes this service owns. The statement is not a guard. Get,
 * get-by-email, and get-by-ids are not a plan.
 */
export const compileUserPlan = (plan: UserPlan): readonly GuardedStatement[] => [
  userInsert(plan.user),
];
