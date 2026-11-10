import { describe, beforeEach, afterEach } from 'vitest';
import { createTestDatabase } from '../platform/database/test-utils.js';
import type { Database } from '../platform/database/types.js';
import { loadActorNamesFromSqlite } from '../access/infrastructure/load-actor-names.js';
import { loadNoteSubjectFacts } from '../modules/notes/infrastructure/persistence/note-subject-facts.js';
import { storageError } from '../modules/task-management/domain/messages/project-errors.js';
import {
  loadProjectNameFacts,
  loadTaskSubjectFacts,
} from '../modules/task-management/infrastructure/persistence/subject-facts.js';
import { createTimelineLookups } from '../modules/history/infrastructure/timeline-lookups.js';
import { timelineLookupContract } from '../modules/history/infrastructure/timeline-lookups.contract.js';

const now = '2026-10-11T15:00:00.000Z';

describe('sqlite timeline lookups', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createTestDatabase();
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', now],
    });
    await db.execute({
      sql: `INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)`,
      args: ['user-named', 'Lane', 'lane@example.com', now],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-email', 'owner@example.com', now],
    });
    await db.execute({
      sql: `INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)`,
      args: ['user-blank', '', 'blank@example.com', now],
    });
    await db.execute({
      sql: `INSERT INTO projects (
              id, organization_id, created_by_id, name, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['project-1', 'org-1', 'user-email', 'Kitchen renovation', 'active', now],
    });
    await db.execute({
      sql: `INSERT INTO tasks (
              id, organization_id, created_by_id, title, project_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['task-open', 'org-1', 'user-email', 'Call Trident', 'project-1', now],
    });
    await db.execute({
      sql: `INSERT INTO tasks (
              id, organization_id, created_by_id, title, project_id, created_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'task-deleted',
        'org-1',
        'user-email',
        'Old invoice',
        'project-1',
        now,
        '2026-10-11T16:00:00.000Z',
      ],
    });
    await db.execute({
      sql: `INSERT INTO project_notes (
              id, organization_id, project_id, title, body, version,
              created_at, created_by, updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'note-open',
        'org-1',
        'project-1',
        'Kickoff',
        'First line',
        '1',
        now,
        'user-email',
        now,
        'user-email',
      ],
    });
    await db.execute({
      sql: `INSERT INTO project_notes (
              id, organization_id, project_id, title, body, version,
              created_at, created_by, updated_at, updated_by, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'note-deleted',
        'org-1',
        'project-1',
        'Old draft',
        'Gone',
        '2',
        now,
        'user-email',
        now,
        'user-email',
        '2026-10-11T16:00:00.000Z',
      ],
    });
  });

  afterEach(async () => {
    await db.close();
  });

  const load = () =>
    createTimelineLookups({
      loadTaskSubjects: (ids) =>
        loadTaskSubjectFacts(db)(ids).mapErr((error) => storageError(error.message, error.cause)),
      loadProjectNames: (ids) =>
        loadProjectNameFacts(db)(ids).mapErr((error) => storageError(error.message, error.cause)),
      loadNoteSubjects: (ids) =>
        loadNoteSubjectFacts(db)(ids).mapErr((error) => storageError(error.message, error.cause)),
      loadActorNames: (ids) =>
        loadActorNamesFromSqlite(db)(ids).mapErr((error) =>
          storageError(error.message, error.cause)
        ),
    });

  timelineLookupContract(load);
});
