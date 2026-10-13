import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { okAsync } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import { createTestDatabase } from '../../database/test-utils.js';
import type { Database } from '../../database/types.js';
import { createNoteHandlers } from '../application/create-note-handlers.js';
import { createSqliteNotesBackend } from './sqlite-notes-backend.js';

const orgId = '11111111-1111-4111-8111-111111111111';
const projectId = '33333333-3333-4333-8333-333333333333';
const userId = '55555555-5555-4555-8555-555555555555';

const project: Project = {
  id: projectId,
  organizationId: orgId,
  name: 'Garden',
  status: 'active',
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: null,
  notebookPages: [],
  createdById: userId,
  createdAt: '2026-10-12T18:00:00.000Z',
  lastChangedAt: '2026-10-12T18:00:00.000Z',
  lastChangedBy: userId,
};

describe('sqlite notes persist rollback', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createTestDatabase();
    await db.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: [orgId, 'Org', '2026-10-12T18:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)`,
      args: [userId, 'Lane', 'lane@example.com', '2026-10-12T18:00:00.000Z'],
    });
    await db.execute({
      sql: `INSERT INTO projects (
              id, organization_id, created_by_id, name, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [projectId, orgId, userId, 'Garden', 'active', '2026-10-12T18:00:00.000Z'],
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('does not leave a timeline row when the note write fails', async () => {
    const api = createNoteHandlers({
      backend: createSqliteNotesBackend(db),
      loadProject: (id) => okAsync(id === projectId ? project : null),
      loadActorName: () => okAsync('Lane'),
      loadOrgPerson: () => okAsync({ userId, name: 'Lane' }),
      loadNotesMirrorBot: () => okAsync('bot-1'),
      nextId: (() => {
        let n = 0;
        return () => {
          n += 1;
          return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
        };
      })(),
      now: () => '2026-10-12T18:00:00.000Z',
      logger: { info: () => undefined },
    });

    await db.execute({
      sql: `
        CREATE TRIGGER fail_notes BEFORE INSERT ON project_notes
        BEGIN
          SELECT RAISE(ABORT, 'note write failed');
        END
      `,
    });

    const created = await api.create({
      projectId,
      organizationId: orgId,
      title: 'Meeting notes',
      actor: { kind: 'user', userId, via: 'session' },
    });
    expect(created.isErr()).toBe(true);

    const notes = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM project_notes`,
    });
    const logs = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM change_log WHERE subject_type = 'note'`,
    });
    expect(Number(notes.rows[0]?.n ?? -1)).toBe(0);
    expect(Number(logs.rows[0]?.n ?? -1)).toBe(0);
  });
});
