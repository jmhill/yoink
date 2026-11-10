import type { GuardedStatement, SqlParticipant } from '../../../../kernel/unit-of-work.js';
import type { TaskManagementStep } from '../../domain/projections/task-management-step.js';
import { statementsForTaskManagementStep } from './compile-task-management-plan.js';

const NOT_A_PLAN: GuardedStatement = {
  verb: 'insert',
  sql: '',
  args: [],
  guard: false,
};

const isStep = (plan: unknown): plan is TaskManagementStep =>
  typeof plan === 'object' &&
  plan !== null &&
  'type' in plan &&
  (plan.type === 'task' ||
    plan.type === 'project' ||
    plan.type === 'list' ||
    plan.type === 'import-apply' ||
    plan.type === 'import-discard');

export const taskManagementSqlParticipant: SqlParticipant<unknown> = {
  owner: 'task-management',
  compile: (plan) => {
    if (!isStep(plan)) {
      return [NOT_A_PLAN];
    }
    return statementsForTaskManagementStep(plan);
  },
};
