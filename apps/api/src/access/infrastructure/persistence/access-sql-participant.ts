import type { GuardedStatement, SqlParticipant } from '../../../kernel/unit-of-work.js';
import { isAdminPlan } from '../../domain/admin-plan.js';
import { isMintAgentPlan } from '../../domain/agent-plan.js';
import { isInvitationPlan } from '../../domain/invitation-plan.js';
import { isMembershipPlan } from '../../domain/membership-plan.js';
import { isOrganizationPlan } from '../../domain/organization-plan.js';
import { isPasskeyPlan } from '../../domain/passkey-plan.js';
import { isSessionPlan } from '../../domain/session-plan.js';
import { isSignupPlan } from '../../domain/signup-plan.js';
import { compileAdminPlan } from './compile-admin.js';
import { compileMintAgentPlan } from './compile-agent.js';
import { compileInvitationPlan } from './compile-invitation.js';
import { compileMembershipPlan } from './compile-membership.js';
import { compileOrganizationPlan } from './compile-organization.js';
import { compilePasskeyPlan } from './compile-passkey.js';
import { compileSessionPlan } from './compile-session.js';
import { compileSignupPlan } from './compile-signup.js';

/** Empty sql is not a write. The unit of work reports Storage and does not run it. */
const NOT_A_PLAN: GuardedStatement = {
  verb: 'insert',
  sql: '',
  args: [],
  guard: false,
};

export const accessSqlParticipant: SqlParticipant<unknown> = {
  owner: 'access',
  compile: (plan) => {
    if (isSignupPlan(plan)) {
      return compileSignupPlan(plan);
    }
    if (isAdminPlan(plan)) {
      return compileAdminPlan(plan);
    }
    if (isMintAgentPlan(plan)) {
      return compileMintAgentPlan(plan);
    }
    if (isInvitationPlan(plan)) {
      return compileInvitationPlan(plan);
    }
    if (isMembershipPlan(plan)) {
      return compileMembershipPlan(plan);
    }
    if (isOrganizationPlan(plan)) {
      return compileOrganizationPlan(plan);
    }
    if (isPasskeyPlan(plan)) {
      return compilePasskeyPlan(plan);
    }
    if (isSessionPlan(plan)) {
      return compileSessionPlan(plan);
    }
    return [NOT_A_PLAN];
  },
};
