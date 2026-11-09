import type { GuardedStatement } from '../../../kernel/unit-of-work.js';
import type { SignupPlan } from '../../domain/signup-plan.js';
import { eventInsert } from '../membership-event-insert.js';
import { organizationInsertQuery } from '../membership-statements.js';

const statement = (
  verb: GuardedStatement['verb'],
  sql: string,
  args: readonly unknown[],
  guard: boolean
): GuardedStatement => ({ verb, sql, args, guard });

/**
 * User insert is the only guard. `rowsAffected === 0` means the normalized
 * email is already taken. Later writes are conditional on that user id so
 * they insert nothing instead of throwing a foreign key.
 */
export const compileSignupPlan = (plan: SignupPlan): readonly GuardedStatement[] => {
  const user = plan.user;
  const personalOrganization = organizationInsertQuery(plan.personalOrganization);
  const statements: GuardedStatement[] = [
    statement(
      'insert',
      `
        INSERT INTO users (id, email, name, kind, created_at)
        SELECT ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM users WHERE lower(trim(email)) = lower(trim(?))
        )
      `,
      [user.id, user.email, user.name ?? null, user.kind ?? 'human', user.createdAt, user.email],
      true
    ),
    statement('insert', personalOrganization.sql, personalOrganization.args, false),
    statement(
      'insert',
      `
        INSERT INTO organization_memberships (
          id, user_id, organization_id, role, is_personal_org, joined_at
        )
        SELECT ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)
      `,
      [
        plan.personalMembership.id,
        plan.personalMembership.userId,
        plan.personalMembership.organizationId,
        plan.personalMembership.role,
        plan.personalMembership.isPersonalOrg ? 1 : 0,
        plan.personalMembership.joinedAt,
        user.id,
      ],
      false
    ),
    statement(
      'insert',
      `
        INSERT INTO organization_memberships (
          id, user_id, organization_id, role, is_personal_org, joined_at
        )
        SELECT ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)
      `,
      [
        plan.invitedMembership.id,
        plan.invitedMembership.userId,
        plan.invitedMembership.organizationId,
        plan.invitedMembership.role,
        plan.invitedMembership.isPersonalOrg ? 1 : 0,
        plan.invitedMembership.joinedAt,
        user.id,
      ],
      false
    ),
    statement(
      'update',
      `
        UPDATE invitations
        SET accepted_at = ?, accepted_by_user_id = ?
        WHERE id = ? AND EXISTS (SELECT 1 FROM users WHERE id = ?)
      `,
      [
        plan.accepted.acceptedAt,
        plan.accepted.acceptedByUserId,
        plan.accepted.id,
        user.id,
      ],
      false
    ),
  ];

  if (plan.event) {
    const query = eventInsert(plan.event);
    statements.push(
      statement(
        'insert',
        query.sql.replace(
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          'SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)'
        ),
        [...query.args, user.id],
        false
      )
    );
  }

  const credential = plan.credential;
  statements.push(
    statement(
      'insert',
      `
        INSERT INTO passkey_credentials (
          id, user_id, public_key, counter, transports, device_type, backed_up, name, created_at, last_used_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)
      `,
      [
        credential.id,
        credential.userId,
        credential.publicKey,
        credential.counter,
        credential.transports ? JSON.stringify(credential.transports) : null,
        credential.deviceType,
        credential.backedUp ? 1 : 0,
        credential.name ?? null,
        credential.createdAt,
        credential.lastUsedAt ?? null,
        user.id,
      ],
      false
    )
  );

  const session = plan.session;
  statements.push(
    statement(
      'insert',
      `
        INSERT INTO user_sessions (
          id, user_id, current_organization_id, created_at, expires_at, last_active_at
        )
        SELECT ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)
      `,
      [
        session.id,
        session.userId,
        session.currentOrganizationId,
        session.createdAt,
        session.expiresAt,
        session.lastActiveAt,
        user.id,
      ],
      false
    )
  );

  return statements;
};
