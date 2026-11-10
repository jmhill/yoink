import type { Project } from '@yoink/api-contracts';
import type { GuardedStatement, WriteVerb } from '../../../../kernel/unit-of-work.js';
import {
  changeLogInsert,
  changeLogInsertAfter,
} from '../../../history/infrastructure/sqlite-event-sink.js';
import type { ChangeLogRecord } from '../../../history/domain/record.js';
import type { SqlQuery } from '../../../history/infrastructure/sql.js';
import type { TaskManagementStep } from '../../domain/projections/task-management-step.js';
import type { TaskChangePlan } from '../../domain/projections/plan-task-change.js';
import type { ProjectChangePlan } from '../../domain/projections/plan-project-change.js';
import type { ListChangePlan } from '../../domain/projections/plan-list-change.js';
import {
  clearNextActionQuery,
  insertProjectQuery,
  setNextActionQuery,
  updateProjectQuery,
} from './rows/project-row-statements.js';
import {
  insertListQuery,
  removeListQuery,
  updateListNameQuery,
} from './rows/list-row-statements.js';
import {
  clearCompletedListIdQuery,
  insertTaskQuery,
  setOpenOrderQueries,
  softDeleteTaskQuery,
  updateTaskQuery,
} from './rows/task-row-statements.js';

const write = (query: SqlQuery, verb: WriteVerb, reason?: string): GuardedStatement => ({
  verb,
  sql: reason === undefined ? query.sql : `-- guard:${reason}\n${query.sql}`,
  args: query.args ?? [],
  guard: reason !== undefined,
});

const insertWhere = (query: SqlQuery, whereSql: string, extraArgs: readonly unknown[]): SqlQuery => {
  const values = /VALUES \(([^)]*)\)/;
  const match = values.exec(query.sql);
  const placeholders = match?.[1];
  if (placeholders === undefined) {
    throw new Error('expected an INSERT ... VALUES statement');
  }
  return {
    sql: query.sql.replace(values, `SELECT ${placeholders}\n${whereSql}`),
    args: [...(query.args ?? []), ...extraArgs],
  };
};

const duplicateNameWhere = `
  WHERE NOT EXISTS (
    SELECT 1 FROM projects
    WHERE organization_id = ?
      AND lower(name) = lower(?)
      AND status <> 'declined'
  )`;

const insertProjectGuarded = (project: Project): GuardedStatement =>
  write(
    insertWhere(insertProjectQuery(project), duplicateNameWhere, [
      project.organizationId,
      project.name,
    ]),
    'insert',
    'duplicate-name'
  );

const updateProjectGuarded = (project: Project): GuardedStatement => {
  const query = updateProjectQuery(project);
  return write(
    {
      sql: `${query.sql}
      AND NOT EXISTS (
        SELECT 1 FROM projects AS other
        WHERE other.organization_id = projects.organization_id
          AND other.id <> projects.id
          AND lower(other.name) = lower(?)
          AND other.status <> 'declined'
      )`,
      args: [...(query.args ?? []), project.name],
    },
    'update',
    'duplicate-name'
  );
};

const insertTaskWhereProjectExists = (plan: Extract<TaskChangePlan, { action: 'insert' }>): SqlQuery => {
  const projectId = plan.view.projectId;
  if (!projectId) {
    return insertTaskQuery(plan.view);
  }
  return insertWhere(
    insertTaskQuery(plan.view),
    `WHERE EXISTS (
       SELECT 1 FROM projects WHERE id = ? AND organization_id = ?
     )`,
    [projectId, plan.view.organizationId]
  );
};

const ifChangedRecords = (records: readonly ChangeLogRecord[]): GuardedStatement[] =>
  records.flatMap((record, index) => {
    if (index === 0) {
      return [changeLogInsert(record, { ifChanged: true })];
    }
    const prior = records[0];
    return prior === undefined ? [] : [changeLogInsertAfter(record, prior.id)];
  });

const compileTask = (
  plan: TaskChangePlan,
  whenProjectExists: boolean,
  inlineHistory: boolean
): GuardedStatement[] => {
  const domain = domainTaskStatements(plan, whenProjectExists);
  if (!inlineHistory) {
    return domain;
  }
  return [...domain, ...plan.records.map((record) => changeLogInsert(record))];
};

const domainTaskStatements = (plan: TaskChangePlan, whenProjectExists: boolean): GuardedStatement[] => {
  switch (plan.action) {
    case 'insert':
      return [
        write(
          whenProjectExists ? insertTaskWhereProjectExists(plan) : insertTaskQuery(plan.view),
          'insert'
        ),
      ];
    case 'update':
      return [write(updateTaskQuery(plan.view), 'update', 'task-missing')];
    case 'uncomplete':
      return [
        write(updateTaskQuery(plan.view), 'update', 'task-missing'),
        ...setOpenOrderQueries(plan.organizationId, plan.siblingOrders, plan.view.id).map((query) =>
          write(query, 'update')
        ),
      ];
    case 'delete':
      return [
        write(
          softDeleteTaskQuery(plan.taskId, plan.organizationId, plan.deletedAt),
          'update',
          'task-missing'
        ),
      ];
  }
};

const compileProject = (plan: ProjectChangePlan): GuardedStatement[] => {
  switch (plan.action) {
    case 'insert':
      return [insertProjectGuarded(plan.view)];
    case 'update':
      return [updateProjectGuarded(plan.view)];
    case 'setNextAction':
      return [
        write(
          setNextActionQuery({
            projectId: plan.projectId,
            organizationId: plan.organizationId,
            nextActionTaskId: plan.view.nextActionTaskId ?? '',
            lastChangedAt: plan.view.lastChangedAt,
            lastChangedBy: plan.view.lastChangedBy,
          }),
          'update',
          'project-done'
        ),
      ];
    case 'clearNextAction':
      return [
        write(
          clearNextActionQuery({
            projectId: plan.projectId,
            organizationId: plan.organizationId,
            previousTaskId: plan.previousTaskId,
            lastChangedAt: plan.view.lastChangedAt,
            lastChangedBy: plan.view.lastChangedBy,
          }),
          'update'
        ),
        ...ifChangedRecords(plan.records),
      ];
  }
};

const compileList = (plan: ListChangePlan): GuardedStatement[] => {
  switch (plan.action) {
    case 'insert':
      return [write(insertListQuery(plan.view), 'insert')];
    case 'rename':
      return [write(updateListNameQuery(plan.listId, plan.organizationId, plan.name), 'update')];
    case 'delete':
      return [
        write(clearCompletedListIdQuery(plan.listId, plan.organizationId), 'update'),
        write(removeListQuery(plan.listId, plan.organizationId), 'delete'),
      ];
    case 'reorder':
      return setOpenOrderQueries(plan.organizationId, plan.orders).map((query) => write(query, 'update'));
  }
};

const markImportPending = (input: {
  id: string;
  organizationId: string;
  status: 'applied' | 'discarded';
  decidedById: string;
  decidedAt: string;
}): GuardedStatement =>
  write(
    {
      sql: `
        UPDATE project_imports
        SET status = ?, decided_by = ?, decided_at = ?
        WHERE id = ? AND organization_id = ? AND status = 'pending'
      `,
      args: [input.status, input.decidedById, input.decidedAt, input.id, input.organizationId],
    },
    'update',
    'import-not-pending'
  );

const compileImport = (
  step: Extract<TaskManagementStep, { type: 'import-apply' }>
): GuardedStatement[] => {
  const nextActions = step.write.projects.flatMap((project) =>
    project.nextActionTaskId
      ? [
          write(
            setNextActionQuery({
              projectId: project.id,
              organizationId: project.organizationId,
              nextActionTaskId: project.nextActionTaskId,
              lastChangedAt: project.lastChangedAt,
              lastChangedBy: project.lastChangedBy,
            }),
            'update'
          ),
        ]
      : []
  );
  return [
    markImportPending({
      id: step.stagedImportId,
      organizationId: step.write.organizationId,
      status: 'applied',
      decidedById: step.decidedById,
      decidedAt: step.decidedAt,
    }),
    ...step.write.projects.map((project) =>
      insertProjectGuarded({ ...project, nextActionTaskId: null })
    ),
    ...step.write.tasks.flatMap((plan) => compileTask(plan, true, false)),
    ...nextActions,
  ];
};

export const statementsForTaskManagementStep = (
  step: TaskManagementStep
): readonly GuardedStatement[] => {
  switch (step.type) {
    case 'task':
      return compileTask(step.plan, step.whenProjectExists === true, step.inlineHistory === true);
    case 'project':
      return compileProject(step.plan);
    case 'list':
      return compileList(step.plan);
    case 'import-apply':
      return compileImport(step);
    case 'import-discard':
      return [
        markImportPending({
          id: step.id,
          organizationId: step.organizationId,
          status: 'discarded',
          decidedById: step.decidedById,
          decidedAt: step.decidedAt,
        }),
      ];
  }
};
