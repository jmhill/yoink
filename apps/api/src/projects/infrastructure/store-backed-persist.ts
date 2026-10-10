import { ResultAsync } from 'neverthrow';
import type { Database } from '../../database/types.js';
import { insertChangeLogQuery, type SqlQuery } from '../../shared/change-log/infrastructure/sql.js';
import {
  duplicateProjectNameError,
  storageError,
  type DuplicateProjectNameError,
  type StorageError,
} from '../domain/project-errors.js';
import type { PersistProjectChange, PersistProjectStatusChange } from '../application/ports.js';
import type { ProjectChangePlan } from '../domain/plan-project-change.js';
import { queriesForTaskPlan } from '../../tasks/infrastructure/store-backed-persist.js';
import { insertProjectQuery, updateProjectQuery } from './project-row-statements.js';

export const queriesForProjectPlan = (plan: ProjectChangePlan): SqlQuery[] => {
  const history = plan.records.map((record) => insertChangeLogQuery(record));

  switch (plan.action) {
    case 'insert':
      return [insertProjectQuery(plan.view), ...history];
    case 'update':
      return [updateProjectQuery(plan.view), ...history];
  }
};

const uniqueNameConstraintFailed = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /idx_projects_org_name_ci/i.test(message);
};

const persistFailure = (
  plan: ProjectChangePlan,
  error: unknown
): StorageError | DuplicateProjectNameError => {
  if (uniqueNameConstraintFailed(error)) {
    return duplicateProjectNameError(plan.view.name);
  }
  return storageError('Failed to persist project change', error);
};

export const createSqliteProjectPersist = (deps: {
  db: Database;
}): PersistProjectChange => {
  return (plan) =>
    ResultAsync.fromPromise(
      deps.db.batch(queriesForProjectPlan(plan), 'write'),
      (error) => persistFailure(plan, error)
    ).map(() => undefined);
};

export const createSqliteProjectStatusPersist = (deps: {
  db: Database;
}): PersistProjectStatusChange => {
  return (input) =>
    ResultAsync.fromPromise(
      deps.db.batch(
        [
          ...input.tasks.flatMap((plan) => queriesForTaskPlan(plan)),
          ...queriesForProjectPlan(input.project),
        ],
        'write'
      ),
      (error) => storageError('Failed to persist project status change', error)
    ).map(() => undefined);
};
