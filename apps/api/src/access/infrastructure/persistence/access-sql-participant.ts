import type { GuardedStatement, SqlParticipant } from '../../../kernel/unit-of-work.js';
import { isAdminPlan } from '../../domain/admin-plan.js';
import { isSignupPlan } from '../../domain/signup-plan.js';
import { compileAdminPlan } from './compile-admin.js';
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
    return [NOT_A_PLAN];
  },
};
