import type { GuardedStatement, SqlParticipant } from '../../../kernel/unit-of-work.js';
import { isSignupPlan } from '../../domain/signup-plan.js';
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
  compile: (plan) => (isSignupPlan(plan) ? compileSignupPlan(plan) : [NOT_A_PLAN]),
};
