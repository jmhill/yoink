import type { GuardedStatement } from '../../../kernel/unit-of-work.js';
import type { AdminPlan } from '../../domain/admin-plan.js';
import { eventInsert } from '../membership-event-insert.js';
import {
  membershipRoleUpdateQuery,
  planQueries,
  userInsertQuery,
} from '../membership-statements.js';
import { replacedQueries } from '../invitation-statements.js';

const statement = (
  verb: GuardedStatement['verb'],
  sql: string,
  args: readonly unknown[],
  guard: boolean
): GuardedStatement => ({ verb, sql, args, guard });

/**
 * Same upsert the organization store save uses. A new id inserts. An existing
 * id updates the name and leaves created_at alone.
 */
const organizationUpsert = (organization: {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}): GuardedStatement =>
  statement(
    'insert',
    `
      INSERT INTO organizations (id, name, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name
    `,
    [organization.id, organization.name, organization.createdAt],
    false
  );

/**
 * Same upsert the membership store save uses. A new pair inserts. An existing
 * user in the workspace updates role instead of throwing.
 */
const membershipUpsert = (membership: {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly role: string;
  readonly isPersonalOrg: boolean;
  readonly joinedAt: string;
}): GuardedStatement =>
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

/**
 * Admin writes. The user insert is not a guard: a duplicate email throws,
 * and the unit of work reports Storage for the whole batch. That is today's
 * admin create-user failure, not signup's Conflict. Membership is unconditional
 * because that user insert cannot succeed with zero rows.
 * The user-name update is the only guard. There is no later statement.
 */
export const compileAdminPlan = (plan: AdminPlan): readonly GuardedStatement[] => {
  switch (plan.kind) {
    case 'create-organization':
    case 'rename-organization':
      return [organizationUpsert(plan.organization)];
    case 'create-member': {
      const user = userInsertQuery(plan.user);
      return [
        statement('insert', user.sql, user.args, false),
        membershipUpsert(plan.membership),
      ];
    }
    case 'rename-user':
      return [
        statement(
          'update',
          `UPDATE users SET name = ? WHERE id = ?`,
          [plan.name, plan.userId],
          true
        ),
      ];
    case 'set-owner': {
      const statements: GuardedStatement[] = planQueries(plan.transfer).map((query) =>
        statement('update', query.sql, query.args, false)
      );
      const event = eventInsert(plan.event);
      statements.push(statement('insert', event.sql, event.args, false));
      for (const query of replacedQueries(plan.replaced)) {
        statements.push(statement('update', query.sql, query.args, false));
      }
      return statements;
    }
    case 'change-member-role': {
      const update = membershipRoleUpdateQuery(plan.membership);
      const event = eventInsert(plan.event);
      return [
        statement('update', update.sql, update.args, false),
        statement('insert', event.sql, event.args, false),
      ];
    }
    case 'create-admin-token': {
      const token = plan.token;
      return [
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
        ),
      ];
    }
    case 'revoke-admin-token':
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
