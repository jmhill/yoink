import { ResultAsync } from 'neverthrow';
import type { Database } from '../../database/types.js';
import { insertChangeLogQuery, type SqlQuery } from '../../shared/change-log/infrastructure/sql.js';
import { storageError } from '../domain/project-errors.js';
import type { PersistProjectChange } from '../application/ports.js';
import type { ProjectChangePlan } from '../domain/plan-project-change.js';
import { insertProjectQuery, updateProjectQuery } from './project-row-statements.js';

const queriesForPlan = (plan: ProjectChangePlan): SqlQuery[] => {
  const history = plan.records.map((record) => insertChangeLogQuery(record));

  switch (plan.action) {
    case 'insert':
      return [insertProjectQuery(plan.view), ...history];
    case 'update':
      return [updateProjectQuery(plan.view), ...history];
  }
};

export const createSqliteProjectPersist = (deps: {
  db: Database;
}): PersistProjectChange => {
  return (plan) =>
    ResultAsync.fromPromise(
      deps.db.batch(queriesForPlan(plan), 'write'),
      (error) => storageError('Failed to persist project change', error)
    ).map(() => undefined);
};
