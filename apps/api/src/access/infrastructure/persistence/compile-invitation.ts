import type { GuardedStatement } from '../../../kernel/unit-of-work.js';
import type { InvitationPlan } from '../../domain/invitation-plan.js';
import { invitationUpsertQuery } from '../invitation-statements.js';

const statement = (
  verb: GuardedStatement['verb'],
  sql: string,
  args: readonly unknown[],
  guard: boolean
): GuardedStatement => ({ verb, sql, args, guard });

/**
 * Invitation writes. Neither statement is a guard. A duplicate code throws,
 * and the batch is Storage, matching the invitation store. The insert is
 * that store's upsert. Revoke is the store's delete.
 */
export const compileInvitationPlan = (plan: InvitationPlan): readonly GuardedStatement[] => {
  switch (plan.kind) {
    case 'create-invitation': {
      const query = invitationUpsertQuery(plan.invitation);
      return [statement('insert', query.sql, query.args, false)];
    }
    case 'revoke-invitation':
      return [
        statement('delete', `DELETE FROM invitations WHERE id = ?`, [plan.invitationId], false),
      ];
    default: {
      const _never: never = plan;
      return _never;
    }
  }
};
