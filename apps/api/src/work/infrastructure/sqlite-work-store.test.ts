import { afterAll, beforeAll, describe } from 'vitest';
import { createTestDatabase, type Database } from '../../database/test-utils.js';
import { insertProjectQuery } from '../../projects/infrastructure/project-row-statements.js';
import { insertTaskQuery, softDeleteTaskQuery } from '../../tasks/infrastructure/task-row-statements.js';
import {
  runWorkStoreContractTests,
  workFixtureLists,
  workFixtureProjects,
  workFixtureTasks,
  WORK_CREATED_BY,
  WORK_ORG,
  WORK_TASK,
} from '../domain/work-store.contract.js';
import { createSqliteWorkStore } from './sqlite-work-store.js';

const seedFixture = async (db: Database): Promise<void> => {
  await db.execute({
    sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
    args: [WORK_ORG, 'Work org', '2025-01-15T10:00:00.000Z'],
  });
  await db.execute({
    sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
    args: [WORK_CREATED_BY, 'owner@example.com', '2025-01-15T10:00:00.000Z'],
  });
  for (const list of workFixtureLists()) {
    await db.execute({
      sql: `
        INSERT INTO lists (id, organization_id, created_by_id, name, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [list.id, list.organizationId, list.createdById, list.name, list.createdAt],
    });
  }
  for (const project of workFixtureProjects()) {
    await db.execute(insertProjectQuery({ ...project, nextActionTaskId: null }));
  }
  for (const task of workFixtureTasks()) {
    await db.execute(insertTaskQuery(task));
  }
  await db.execute(softDeleteTaskQuery(WORK_TASK.deletedLoose, WORK_ORG, '2025-01-15T12:00:00.000Z'));
  for (const project of workFixtureProjects()) {
    if (!project.nextActionTaskId) {
      continue;
    }
    await db.execute({
      sql: `UPDATE projects SET next_action_task_id = ? WHERE id = ?`,
      args: [project.nextActionTaskId, project.id],
    });
  }
};

describe('SqliteWorkStore', () => {
  let db: Database;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  runWorkStoreContractTests({
    createHarness: () => ({
      store: createSqliteWorkStore(db),
    }),
    beforeEach: async () => {
      await db.execute({ sql: 'UPDATE projects SET next_action_task_id = NULL' });
      await db.execute({ sql: 'DELETE FROM tasks' });
      await db.execute({ sql: 'DELETE FROM projects' });
      await db.execute({ sql: 'DELETE FROM lists' });
      await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [WORK_CREATED_BY] });
      await db.execute({ sql: 'DELETE FROM organizations WHERE id = ?', args: [WORK_ORG] });
      await seedFixture(db);
    },
  });
});
