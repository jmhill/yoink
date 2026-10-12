import { afterAll, beforeAll, describe } from 'vitest';
import { createTestDatabase, type Database } from '../../database/test-utils.js';
import { insertProjectQuery } from '../../projects/infrastructure/project-row-statements.js';
import { insertTaskQuery, softDeleteTaskQuery } from '../../tasks/infrastructure/task-row-statements.js';
import {
  REVIEW_CHANGE,
  REVIEW_CREATED_BY,
  REVIEW_ORG,
  REVIEW_OTHER_ORG,
  REVIEW_OTHER_USER,
  REVIEW_TASK,
  reviewFixtureChangeLog,
  reviewFixtureProjects,
  reviewFixtureTasks,
  runReviewStoreContractTests,
} from '../domain/review-store.contract.js';
import { createSqliteReviewStore } from './sqlite-review-store.js';

const insertChangeLog = async (
  db: Database,
  input: {
    id: string;
    organizationId: string;
    projectId: string;
    subjectId: string;
    occurredAt: string;
    seq: number;
  }
): Promise<void> => {
  await db.execute({
    sql: `
      INSERT INTO change_log (
        id, organization_id, project_id, subject_type, subject_id,
        kind, schema_version, payload_json, actor_user_id, actor_kind,
        occurred_at, hidden, seq
      ) VALUES (?, ?, ?, 'task', ?, 'TaskUpdated', 1, '{}', ?, 'user', ?, 0, ?)
    `,
    args: [
      input.id,
      input.organizationId,
      input.projectId,
      input.subjectId,
      REVIEW_CREATED_BY,
      input.occurredAt,
      input.seq,
    ],
  });
};

const seedFixture = async (db: Database): Promise<void> => {
  await db.execute({
    sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
    args: [REVIEW_ORG, 'Review org', '2026-10-01T10:00:00.000Z'],
  });
  await db.execute({
    sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
    args: [REVIEW_OTHER_ORG, 'Other org', '2026-10-01T10:00:00.000Z'],
  });
  await db.execute({
    sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
    args: [REVIEW_CREATED_BY, 'owner@example.com', '2026-10-01T10:00:00.000Z'],
  });
  await db.execute({
    sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
    args: [REVIEW_OTHER_USER, 'other@example.com', '2026-10-01T10:00:00.000Z'],
  });
  for (const project of reviewFixtureProjects()) {
    await db.execute(insertProjectQuery({ ...project, nextActionTaskId: null }));
  }
  for (const task of reviewFixtureTasks()) {
    await db.execute(insertTaskQuery(task));
  }
  await db.execute(softDeleteTaskQuery(REVIEW_TASK.deleted, REVIEW_ORG, '2026-10-12T15:30:00.000Z'));
  for (const project of reviewFixtureProjects()) {
    if (!project.nextActionTaskId) {
      continue;
    }
    await db.execute({
      sql: `UPDATE projects SET next_action_task_id = ? WHERE id = ?`,
      args: [project.nextActionTaskId, project.id],
    });
  }
  const logIds = [
    REVIEW_CHANGE.bumpedTask,
    REVIEW_CHANGE.otherProject,
    REVIEW_CHANGE.otherOrg,
    REVIEW_CHANGE.deletedTask,
    '550e8400-e29b-41d4-a716-446655440205',
  ];
  const entries = reviewFixtureChangeLog();
  for (const [index, entry] of entries.entries()) {
    if (entry.projectId === null) {
      continue;
    }
    await insertChangeLog(db, {
      id: logIds[index] ?? `550e8400-e29b-41d4-a716-44665544020${index}`,
      organizationId: entry.organizationId,
      projectId: entry.projectId,
      subjectId: REVIEW_TASK.bumpedNa,
      occurredAt: entry.occurredAt,
      seq: index + 1,
    });
  }
};

describe('SqliteReviewStore', () => {
  let db: Database;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  runReviewStoreContractTests({
    createHarness: () => ({
      store: createSqliteReviewStore(db),
    }),
    beforeEach: async () => {
      await db.execute({ sql: 'UPDATE projects SET next_action_task_id = NULL' });
      await db.execute({ sql: 'DELETE FROM change_log' });
      await db.execute({ sql: 'DELETE FROM tasks' });
      await db.execute({ sql: 'DELETE FROM projects' });
      await db.execute({ sql: 'DELETE FROM users WHERE id IN (?, ?)', args: [REVIEW_CREATED_BY, REVIEW_OTHER_USER] });
      await db.execute({
        sql: 'DELETE FROM organizations WHERE id IN (?, ?)',
        args: [REVIEW_ORG, REVIEW_OTHER_ORG],
      });
      await seedFixture(db);
    },
  });
});
