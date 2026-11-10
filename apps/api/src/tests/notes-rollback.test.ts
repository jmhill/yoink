import { describe, it, expect, afterEach } from 'vitest';
import { okAsync } from 'neverthrow';
import { openDatabase } from '../platform/database/database.js';
import { migrations } from '../platform/database/migrations/index.js';
import { runMigrations } from '../platform/database/migrator.js';
import { createSqliteUnitOfWork } from '../platform/unit-of-work/sqlite-unit-of-work.js';
import { createHistoryEventSink } from '../modules/history/application/prepare-event-sink.js';
import { NOTE_TIMELINE_BUILDERS } from '../modules/history/domain/note-timeline.js';
import { historySqlParticipant } from '../modules/history/infrastructure/sqlite-event-sink.js';
import { createNotes } from '../modules/notes/application/create-notes.js';
import { createSqliteNotesStore } from '../modules/notes/infrastructure/persistence/sqlite-notes-store.js';
import { notesSqlParticipant } from '../modules/notes/infrastructure/persistence/notes-sql-participant.js';

const orgId = '11111111-1111-4111-8111-111111111111';
const projectId = '33333333-3333-4333-8333-333333333333';
const userId = '55555555-5555-4555-8555-555555555555';

const project = {
  id: projectId,
  organizationId: orgId,
  name: 'Garden',
};

describe('sqlite notes persist rollback', () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  it('does not leave a timeline row when the note write fails', async () => {
    const opened = openDatabase({ type: 'memory' });
    closers.push(() => opened.database.close());
    await runMigrations(opened.database, migrations);
    await opened.database.execute({
      sql: `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)`,
      args: [orgId, 'Org', '2026-10-12T18:00:00.000Z'],
    });
    await opened.database.execute({
      sql: `INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)`,
      args: [userId, 'Lane', 'lane@example.com', '2026-10-12T18:00:00.000Z'],
    });
    await opened.database.execute({
      sql: `INSERT INTO projects (
              id, organization_id, created_by_id, name, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [projectId, orgId, userId, 'Garden', 'active', '2026-10-12T18:00:00.000Z'],
    });
    await opened.database.execute({
      sql: `
        CREATE TRIGGER fail_notes BEFORE INSERT ON project_notes
        BEGIN
          SELECT RAISE(ABORT, 'note write failed');
        END
      `,
    });

    let n = 0;
    const nextId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
    const notes = createNotes({
      backend: createSqliteNotesStore(opened.database, {
        loadProject: (id) => okAsync(id === projectId ? project : null),
        loadNoteActors: () => okAsync([{ id: userId, name: 'Lane', email: 'lane@example.com' }]),
      }),
      loadProject: (id) => okAsync(id === projectId ? project : null),
      loadActorName: () => okAsync('Lane'),
      loadOrgPerson: () => okAsync({ userId, name: 'Lane' }),
      loadNotesMirrorBot: () => okAsync('bot-1'),
      uow: createSqliteUnitOfWork({
        client: opened.writeClient,
        participants: [notesSqlParticipant, historySqlParticipant],
        sink: createHistoryEventSink({
          ids: { generate: nextId },
          builders: NOTE_TIMELINE_BUILDERS,
        }),
      }),
      nextId,
      now: () => '2026-10-12T18:00:00.000Z',
      logger: { info: () => undefined },
    });

    const created = await notes.commands.createNote({
      projectId,
      organizationId: orgId,
      title: 'Meeting notes',
      actor: { kind: 'user', userId, via: 'session' },
    });
    expect(created.isErr()).toBe(true);

    const rows = await opened.database.execute({
      sql: `SELECT COUNT(*) AS n FROM project_notes`,
    });
    const logs = await opened.database.execute({
      sql: `SELECT COUNT(*) AS n FROM change_log WHERE subject_type = 'note'`,
    });
    expect(Number(rows.rows[0]?.n ?? -1)).toBe(0);
    expect(Number(logs.rows[0]?.n ?? -1)).toBe(0);
  });
});
