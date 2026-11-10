import type { GuardedStatement } from '../../../kernel/unit-of-work.js';
import type { OrganizationMembership } from '../../domain/organization-membership.js';
import type { MembershipPlan } from '../../domain/membership-plan.js';
import { eventInsert } from '../membership-event-insert.js';
import { membershipRoleUpdateQuery } from '../membership-statements.js';

const statement = (
  verb: GuardedStatement['verb'],
  sql: string,
  args: readonly unknown[],
  guard: boolean
): GuardedStatement => ({ verb, sql, args, guard });

/**
 * Same upsert the membership store save uses. A duplicate pair updates
 * the role. It is not a guard: a second owner throws on the unique index,
 * and the batch is Storage.
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

/**
 * Membership writes. No statement is a guard. Add is the store's upsert.
 * Remove is the store's delete plus the membership event. Role change is
 * the store's update plus the event. A thrown unique-index or foreign key
 * is Storage for the whole batch, matching those store batches.
 */
export const compileMembershipPlan = (plan: MembershipPlan): readonly GuardedStatement[] => {
  switch (plan.kind) {
    case 'add-member':
      return [membershipUpsert(plan.membership)];
    case 'remove-member': {
      const event = eventInsert(plan.event);
      return [
        statement(
          'delete',
          `DELETE FROM organization_memberships WHERE id = ?`,
          [plan.membershipId],
          false
        ),
        statement('insert', event.sql, event.args, false),
      ];
    }
    case 'set-member-role': {
      const update = membershipRoleUpdateQuery(plan.membership);
      const event = eventInsert(plan.event);
      return [
        statement('update', update.sql, update.args, false),
        statement('insert', event.sql, event.args, false),
      ];
    }
    default: {
      const _never: never = plan;
      return _never;
    }
  }
};
