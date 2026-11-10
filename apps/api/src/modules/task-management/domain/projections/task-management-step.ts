import type { ImportWritePlan } from './plan-project-import.js';
import type { ListChangePlan } from './plan-list-change.js';
import type { ProjectChangePlan } from './plan-project-change.js';
import type { TaskChangePlan } from './plan-task-change.js';

/**
 * One task-management write the SQL participant understands.
 * History rows travel as integration events, except a next-action clear,
 * whose insert has to sit beside the update so `changes()` can see it.
 */
export type TaskManagementStep =
  | {
      readonly type: 'task';
      readonly plan: TaskChangePlan;
      readonly whenProjectExists?: boolean;
      /**
       * Write this step's history here, before a following next-action clear.
       * The sink runs after every module step, so a clear's if-changed insert
       * would otherwise sort newer than the task row.
       */
      readonly inlineHistory?: boolean;
    }
  | {
      readonly type: 'project';
      readonly plan: ProjectChangePlan;
    }
  | {
      readonly type: 'list';
      readonly plan: ListChangePlan;
    }
  | {
      readonly type: 'import-apply';
      readonly write: ImportWritePlan;
      readonly stagedImportId: string;
      readonly decidedById: string;
      readonly decidedAt: string;
    }
  | {
      readonly type: 'import-discard';
      readonly id: string;
      readonly organizationId: string;
      readonly decidedById: string;
      readonly decidedAt: string;
    };
