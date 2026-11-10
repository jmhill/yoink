import type { GuardedStatement } from '../../../kernel/unit-of-work.js';
import type { IssueTokenPlan, TokenPlan } from '../../domain/token-plan.js';

const statement = (
  verb: GuardedStatement['verb'],
  sql: string,
  args: readonly unknown[],
  guard: boolean
): GuardedStatement => ({ verb, sql, args, guard });

/**
 * Same insert the token store save uses. A duplicate id throws and the
 * batch is Storage. It is not a guard. The secret is not stored.
 */
const tokenInsert = (plan: IssueTokenPlan): GuardedStatement =>
  statement(
    'insert',
    `
            INSERT INTO api_tokens (id, user_id, organization_id, token_hash, name, last_used_at, created_at, revoked_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
    [
      plan.id,
      plan.userId,
      plan.organizationId,
      plan.tokenHash,
      plan.name,
      null,
      plan.createdAt,
      null,
    ],
    false
  );

/**
 * Token writes this service owns. Neither statement is a guard. Revoke
 * matches the store: a missing row is still success. List is not a plan.
 */
export const compileTokenPlan = (plan: TokenPlan): readonly GuardedStatement[] => {
  switch (plan.kind) {
    case 'issue-token':
      return [tokenInsert(plan)];
    case 'revoke-token':
      return [
        statement(
          'update',
          `UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`,
          [plan.revokedAt, plan.tokenId],
          false
        ),
      ];
    default: {
      const _never: never = plan;
      return _never;
    }
  }
};
