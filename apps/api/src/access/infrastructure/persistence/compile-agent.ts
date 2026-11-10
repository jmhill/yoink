import type { GuardedStatement } from '../../../kernel/unit-of-work.js';
import type { ApiToken } from '../../domain/api-token.js';
import type { MintAgentPlan } from '../../domain/agent-plan.js';
import type { OrganizationMembership } from '../../domain/organization-membership.js';
import { userInsertQuery } from '../membership-statements.js';

const statement = (
  verb: GuardedStatement['verb'],
  sql: string,
  args: readonly unknown[],
  guard: boolean
): GuardedStatement => ({ verb, sql, args, guard });

/**
 * Same upsert the membership store save uses. A new pair inserts.
 */
const membershipUpsert = (membership: OrganizationMembership): GuardedStatement =>
  statement(
    'insert',
    `
      INSERT INTO organization_memberships (
        id, user_id, organization_id, role, is_personal_org, joined_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, organization_id) DO UPDATE SET
        role = excluded.role,
        is_personal_org = excluded.is_personal_org
    `,
    [
      membership.id,
      membership.userId,
      membership.organizationId,
      membership.role,
      membership.isPersonalOrg ? 1 : 0,
      membership.joinedAt,
    ],
    false
  );

/** Same insert the token store save uses. */
const tokenInsert = (token: ApiToken): GuardedStatement =>
  statement(
    'insert',
    `
      INSERT INTO api_tokens (
        id, user_id, organization_id, token_hash, name, last_used_at, created_at, revoked_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      token.id,
      token.userId,
      token.organizationId,
      token.tokenHash,
      token.name,
      token.lastUsedAt ?? null,
      token.createdAt,
      token.revokedAt ?? null,
    ],
    false
  );

/**
 * Agent mint. The user insert is not a guard: the email is reserved from the
 * new id, and a collision throws. The batch is then Storage. Membership and
 * the token are unconditional because that insert cannot succeed with zero rows.
 */
export const compileMintAgentPlan = (plan: MintAgentPlan): readonly GuardedStatement[] => {
  const user = userInsertQuery(plan.user);
  return [
    statement('insert', user.sql, user.args, false),
    membershipUpsert(plan.membership),
    tokenInsert(plan.token),
  ];
};
