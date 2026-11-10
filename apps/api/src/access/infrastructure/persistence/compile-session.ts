import type { GuardedStatement } from '../../../kernel/unit-of-work.js';
import type { SessionPlan } from '../../domain/session-plan.js';
import type { UserSession } from '../../domain/user-session.js';

const statement = (
  verb: GuardedStatement['verb'],
  sql: string,
  args: readonly unknown[],
  guard: boolean
): GuardedStatement => ({ verb, sql, args, guard });

/**
 * Same insert the session store save uses. A duplicate id throws and the
 * batch is Storage. It is not a guard.
 */
const sessionInsert = (session: UserSession): GuardedStatement =>
  statement(
    'insert',
    `
            INSERT INTO user_sessions (
              id, user_id, current_organization_id, created_at, expires_at, last_active_at
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
    [
      session.id,
      session.userId,
      session.currentOrganizationId,
      session.createdAt,
      session.expiresAt,
      session.lastActiveAt,
    ],
    false
  );

/**
 * User-session writes this service owns. None of the statements are guards.
 * A missing row is still success, matching the store. Cleanup's count is a
 * read; this delete does not return `rowsAffected`.
 */
export const compileSessionPlan = (plan: SessionPlan): readonly GuardedStatement[] => {
  switch (plan.kind) {
    case 'save-session':
      return [sessionInsert(plan.session)];
    case 'refresh-session':
      return [
        statement(
          'update',
          `UPDATE user_sessions SET last_active_at = ? WHERE id = ?`,
          [plan.lastActiveAt, plan.sessionId],
          false
        ),
      ];
    case 'revoke-session':
      return [
        statement('delete', `DELETE FROM user_sessions WHERE id = ?`, [plan.sessionId], false),
      ];
    case 'revoke-user-sessions':
      return [
        statement(
          'delete',
          `DELETE FROM user_sessions WHERE user_id = ?`,
          [plan.userId],
          false
        ),
      ];
    case 'switch-session-organization':
      return [
        statement(
          'update',
          `UPDATE user_sessions SET current_organization_id = ? WHERE id = ?`,
          [plan.organizationId, plan.sessionId],
          false
        ),
      ];
    case 'delete-expired-sessions':
      return [
        statement(
          'delete',
          `DELETE FROM user_sessions WHERE expires_at < ?`,
          [plan.now],
          false
        ),
      ];
    default: {
      const _never: never = plan;
      return _never;
    }
  }
};
