import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBareTestDatabase } from '../test-utils.js';
import { runMigrations } from '../migrator.js';
import { migrations } from './index.js';
import type { Database } from '../types.js';

describe('Migration 29: create_projects', () => {
  let db: Database;

  beforeEach(() => {
    db = createBareTestDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  const seedOrgAndUser = async () => {
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: ['org-1', 'Org', '2025-01-15T10:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`,
      args: ['user-1', 'owner@example.com', '2025-01-15T10:00:00.000Z'],
    });
  };

  const insertChangeLog = async (row: {
    id: string;
    subjectType: string;
    subjectId: string;
    kind: string;
    actorUserId: string | null;
    actorKind: string | null;
    hidden: number;
  }) => {
    await db.execute({
      sql: `
        INSERT INTO change_log (
          id, organization_id, project_id, subject_type, subject_id,
          kind, schema_version, payload_json, actor_user_id, actor_kind,
          occurred_at, hidden
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        row.id,
        'org-1',
        null,
        row.subjectType,
        row.subjectId,
        row.kind,
        1,
        '{}',
        row.actorUserId,
        row.actorKind,
        '2025-01-15T10:00:00.000Z',
        row.hidden,
      ],
    });
  };

  const indexColumns = async (name: string): Promise<string[]> => {
    const info = await db.execute({ sql: `PRAGMA index_info('${name}')` });
    return info.rows
      .slice()
      .sort((left, right) => Number(left.seqno) - Number(right.seqno))
      .map((row) => String(row.name));
  };

  const indexSql = async (name: string): Promise<string> => {
    const result = await db.execute({
      sql: `SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?`,
      args: [name],
    });
    return String(result.rows[0]?.sql ?? '');
  };

  it('keeps every existing change_log row and recreates indexes with the same columns', async () => {
    await runMigrations(db, migrations.slice(0, 28));
    await seedOrgAndUser();

    await insertChangeLog({
      id: 'log-task',
      subjectType: 'task',
      subjectId: 'task-1',
      kind: 'TaskCreated',
      actorUserId: 'user-1',
      actorKind: 'user',
      hidden: 0,
    });
    await insertChangeLog({
      id: 'log-list',
      subjectType: 'list',
      subjectId: 'list-1',
      kind: 'NamedListCreated',
      actorUserId: 'user-1',
      actorKind: 'user',
      hidden: 0,
    });
    await insertChangeLog({
      id: 'log-hidden',
      subjectType: 'task',
      subjectId: 'task-2',
      kind: 'TaskCreated',
      actorUserId: 'user-1',
      actorKind: 'bot',
      hidden: 1,
    });
    await insertChangeLog({
      id: 'log-null-actor',
      subjectType: 'task',
      subjectId: 'task-3',
      kind: 'TaskCreated',
      actorUserId: null,
      actorKind: null,
      hidden: 0,
    });

    const before = await db.execute({ sql: `SELECT COUNT(*) AS count FROM change_log` });
    expect(before.rows[0]?.count).toBe(4);

    await runMigrations(db, migrations);

    const after = await db.execute({
      sql: `
        SELECT id, subject_type, kind, actor_user_id, actor_kind, hidden
        FROM change_log
        ORDER BY id
      `,
    });
    expect(after.rows).toHaveLength(4);
    expect(
      after.rows.map((row) => ({
        id: row.id,
        subject_type: row.subject_type,
        kind: row.kind,
        actor_user_id: row.actor_user_id,
        actor_kind: row.actor_kind,
        hidden: Number(row.hidden),
      }))
    ).toEqual([
      {
        id: 'log-hidden',
        subject_type: 'task',
        kind: 'TaskCreated',
        actor_user_id: 'user-1',
        actor_kind: 'bot',
        hidden: 1,
      },
      {
        id: 'log-list',
        subject_type: 'list',
        kind: 'NamedListCreated',
        actor_user_id: 'user-1',
        actor_kind: 'user',
        hidden: 0,
      },
      {
        id: 'log-null-actor',
        subject_type: 'task',
        kind: 'TaskCreated',
        actor_user_id: null,
        actor_kind: null,
        hidden: 0,
      },
      {
        id: 'log-task',
        subject_type: 'task',
        kind: 'TaskCreated',
        actor_user_id: 'user-1',
        actor_kind: 'user',
        hidden: 0,
      },
    ]);

    expect(await indexColumns('idx_change_log_subject')).toEqual([
      'subject_type',
      'subject_id',
      'occurred_at',
    ]);
    expect(await indexColumns('idx_change_log_org')).toEqual(['organization_id', 'occurred_at']);
    expect(await indexColumns('idx_change_log_org_project')).toEqual([
      'organization_id',
      'project_id',
      'occurred_at',
    ]);
    expect(await indexSql('idx_projects_org_name_ci')).toMatch(
      /idx_projects_org_name_ci[\s\S]*organization_id,\s*lower\(name\)/i
    );
  });

  it('refuses bad subject_type, actor_kind, and hidden after the rebuild', async () => {
    await runMigrations(db, migrations);
    await seedOrgAndUser();

    await expect(
      insertChangeLog({
        id: 'log-bad-subject',
        subjectType: 'notebook',
        subjectId: 'note-1',
        kind: 'NoteCreated',
        actorUserId: 'user-1',
        actorKind: 'user',
        hidden: 0,
      })
    ).rejects.toThrow();

    await expect(
      insertChangeLog({
        id: 'log-bad-actor',
        subjectType: 'task',
        subjectId: 'task-1',
        kind: 'TaskCreated',
        actorUserId: 'user-1',
        actorKind: 'agent',
        hidden: 0,
      })
    ).rejects.toThrow();

    await expect(
      insertChangeLog({
        id: 'log-bad-hidden',
        subjectType: 'task',
        subjectId: 'task-1',
        kind: 'TaskCreated',
        actorUserId: 'user-1',
        actorKind: 'user',
        hidden: 2,
      })
    ).rejects.toThrow();
  });

  it('enforces the organization foreign key on change_log and projects', async () => {
    await runMigrations(db, migrations);
    await seedOrgAndUser();
    await db.execute({ sql: 'PRAGMA foreign_keys = ON' });

    await expect(
      db.execute({
        sql: `
          INSERT INTO change_log (
            id, organization_id, project_id, subject_type, subject_id,
            kind, schema_version, payload_json, actor_user_id, actor_kind,
            occurred_at, hidden
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          'log-orphan',
          'org-missing',
          null,
          'task',
          'task-1',
          'TaskCreated',
          1,
          '{}',
          'user-1',
          'user',
          '2025-01-15T10:00:00.000Z',
          0,
        ],
      })
    ).rejects.toThrow();

    await expect(
      db.execute({
        sql: `INSERT INTO projects (
                id, organization_id, created_by_id, name, status, created_at
              ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: ['project-1', 'org-missing', 'user-1', 'Garden', 'active', '2025-01-15T10:00:00.000Z'],
      })
    ).rejects.toThrow();
  });

  it('creates projects with a case-insensitive unique name per organization', async () => {
    await runMigrations(db, migrations);
    await seedOrgAndUser();

    await db.execute({
      sql: `INSERT INTO projects (
              id, organization_id, created_by_id, name, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['project-1', 'org-1', 'user-1', 'Garden', 'active', '2025-01-15T10:00:00.000Z'],
    });

    await expect(
      db.execute({
        sql: `INSERT INTO projects (
                id, organization_id, created_by_id, name, status, created_at
              ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: ['project-2', 'org-1', 'user-1', 'garden', 'active', '2025-01-15T11:00:00.000Z'],
      })
    ).rejects.toThrow();
  });

  it('accepts a project subject_type on change_log after rebuild', async () => {
    await runMigrations(db, migrations);
    await seedOrgAndUser();

    await db.execute({
      sql: `INSERT INTO projects (
              id, organization_id, created_by_id, name, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['project-1', 'org-1', 'user-1', 'Garden', 'active', '2025-01-15T10:00:00.000Z'],
    });

    await expect(
      db.execute({
        sql: `
          INSERT INTO change_log (
            id, organization_id, project_id, subject_type, subject_id,
            kind, schema_version, payload_json, actor_user_id, actor_kind,
            occurred_at, hidden
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          'log-project',
          'org-1',
          'project-1',
          'project',
          'project-1',
          'ProjectCreated',
          1,
          '{"name":"Garden","status":"active","createdById":"user-1"}',
          'user-1',
          'user',
          '2025-01-15T10:00:00.000Z',
          0,
        ],
      })
    ).resolves.toBeDefined();
  });
});
