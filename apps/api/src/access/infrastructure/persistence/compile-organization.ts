import type { GuardedStatement } from '../../../kernel/unit-of-work.js';
import type { Organization } from '../../domain/organization.js';
import type { OrganizationPlan } from '../../domain/organization-plan.js';

const statement = (
  verb: GuardedStatement['verb'],
  sql: string,
  args: readonly unknown[],
  guard: boolean
): GuardedStatement => ({ verb, sql, args, guard });

/**
 * Same upsert the organization store save uses. A new id inserts. An
 * existing id updates the name and leaves created_at, time_zone, and
 * notes_mirror_bot_user_id alone. It is not a guard.
 */
const organizationUpsert = (organization: Organization): GuardedStatement =>
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
 * Organization writes this service owns. The statement is not a guard.
 * It does not name notes_mirror_bot_user_id. That column stays for M5.8.
 */
export const compileOrganizationPlan = (plan: OrganizationPlan): readonly GuardedStatement[] => [
  organizationUpsert(plan.organization),
];
