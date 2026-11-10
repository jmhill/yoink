import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { okAsync } from 'neverthrow';
import type { Database } from '../../../platform/database/types.js';
import type { UnitOfWork } from '../../../kernel/unit-of-work.js';
import { openDatabase } from '../../../platform/database/database.js';
import { migrations } from '../../../platform/database/migrations/index.js';
import { runMigrations } from '../../../platform/database/migrator.js';
import { createInMemoryUnitOfWork } from '../../../platform/unit-of-work/in-memory-unit-of-work.js';
import { createSqliteUnitOfWork } from '../../../platform/unit-of-work/sqlite-unit-of-work.js';
import { createNotes } from '../application/create-notes.js';
import type { NotesBackend } from '../application/ports.js';
import { createFakeNotesBackend } from './fakes/fake-notes-backend.js';
import { createFakeNotesParticipant } from './fakes/fake-notes-participant.js';
import { createSqliteNotesStore } from './persistence/sqlite-notes-store.js';
import { notesSqlParticipant } from './persistence/notes-sql-participant.js';

const orgId = '11111111-1111-4111-8111-111111111111';
const otherOrg = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';
const otherProject = '44444444-4444-4444-8444-444444444444';
const userId = '55555555-5555-4555-8555-555555555555';

const project = {
  id: projectId,
  organizationId: orgId,
  name: 'Garden',
};

const actor = { kind: 'user' as const, userId, via: 'session' as const };

const runNotesBackendContract = (
  name: string,
  createBackend: () =>
    | { backend: NotesBackend; uow: UnitOfWork }
    | Promise<{ backend: NotesBackend; uow: UnitOfWork }>,
  cleanup?: () => Promise<void>
) => {
  describe(`NotesBackend contract [${name}]`, () => {
    let backend: NotesBackend;
    let uow: UnitOfWork;
    let ids = 0;
    let nowMs = Date.parse('2026-10-12T18:00:00.000Z');

    beforeEach(async () => {
      const created = await createBackend();
      backend = created.backend;
      uow = created.uow;
      ids = 0;
      nowMs = Date.parse('2026-10-12T18:00:00.000Z');
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
    });

    const handlers = () => {
      const notes = createNotes({
        backend,
        uow,
        loadProject: (id) => okAsync(id === projectId ? project : null),
        loadActorName: () => okAsync('Lane'),
        loadOrgPerson: () => okAsync({ userId, name: 'Lane' }),
        loadNotesMirrorBot: () => okAsync('bot-1'),
        nextId: () => {
          ids += 1;
          return `00000000-0000-4000-8000-${String(ids).padStart(12, '0')}`;
        },
        now: () => {
          const value = new Date(nowMs).toISOString();
          nowMs += 1000;
          return value;
        },
        logger: { info: () => undefined },
      });
      return {
        create: notes.commands.createNote,
        update: notes.commands.updateNote,
        delete: notes.commands.deleteNote,
        importFromObsidian: notes.commands.importNote,
        list: notes.queries.listNotes,
        get: notes.queries.getNote,
        listChanged: notes.queries.listNotesChanged,
      };
    };

    it('creates, lists without bodies, gets, and updates', async () => {
      const api = handlers();
      const created = await api.create({
        projectId,
        organizationId: orgId,
        title: 'Meeting notes',
        body: 'First line\n\nMore',
        actor,
      });
      expect(created.isOk()).toBe(true);
      if (!created.isOk()) {
        return;
      }
      expect(created.value.view.version).toBe('1');
      expect(created.value.view.createdAt).toBeTruthy();
      expect(created.value.view.updatedAt).toBeTruthy();

      const listed = await api.list({ projectId, organizationId: orgId });
      expect(listed.isOk()).toBe(true);
      if (listed.isOk()) {
        expect(listed.value.items).toHaveLength(1);
        expect(listed.value.items[0]?.excerpt).toBe('First line');
        expect(listed.value.items[0]).not.toHaveProperty('body');
        expect(listed.value.total).toBe(1);
        expect(listed.value.hasMore).toBe(false);
      }

      const fetched = await api.get({
        noteId: created.value.view.id,
        projectId,
        organizationId: orgId,
      });
      expect(fetched.isOk()).toBe(true);
      if (fetched.isOk()) {
        expect(fetched.value.body).toBe('First line\n\nMore');
      }

      const updated = await api.update({
        noteId: created.value.view.id,
        projectId,
        organizationId: orgId,
        title: 'Renamed',
        expectedVersion: created.value.view.version,
        actor,
      });
      expect(updated.isOk()).toBe(true);
      if (updated.isOk()) {
        expect(updated.value.view.version).toBe('2');
        expect(updated.value.view.title).toBe('Renamed');
      }
    });

    it('refuses a stale version', async () => {
      const api = handlers();
      const created = await api.create({
        projectId,
        organizationId: orgId,
        title: 'Meeting notes',
        actor,
      });
      expect(created.isOk()).toBe(true);
      if (!created.isOk()) {
        return;
      }

      await api.update({
        noteId: created.value.view.id,
        projectId,
        organizationId: orgId,
        body: 'Saved first',
        expectedVersion: created.value.view.version,
        actor,
      });

      const stale = await api.update({
        noteId: created.value.view.id,
        projectId,
        organizationId: orgId,
        body: 'Old copy',
        expectedVersion: created.value.view.version,
        actor,
      });
      expect(stale.isErr()).toBe(true);
      if (stale.isErr()) {
        expect(stale.error.type).toBe('STALE_NOTE');
      }
    });

    it('excludes other org, other project, and deleted notes', async () => {
      const api = handlers();
      const created = await api.create({
        projectId,
        organizationId: orgId,
        title: 'Meeting notes',
        actor,
      });
      expect(created.isOk()).toBe(true);
      if (!created.isOk()) {
        return;
      }

      const otherOrgList = await api.list({ projectId, organizationId: otherOrg });
      expect(otherOrgList.isErr()).toBe(true);

      const otherProjectGet = await api.get({
        noteId: created.value.view.id,
        projectId: otherProject,
        organizationId: orgId,
      });
      expect(otherProjectGet.isErr()).toBe(true);

      await api.delete({
        noteId: created.value.view.id,
        projectId,
        organizationId: orgId,
        actor,
      });
      const afterDelete = await api.get({
        noteId: created.value.view.id,
        projectId,
        organizationId: orgId,
      });
      expect(afterDelete.isErr()).toBe(true);
      if (afterDelete.isErr()) {
        expect(afterDelete.error.type).toBe('NOTE_NOT_FOUND');
      }
      const listed = await api.list({ projectId, organizationId: orgId });
      expect(listed.isOk()).toBe(true);
      if (listed.isOk()) {
        expect(listed.value.total).toBe(0);
      }
    });

    it('lists changes since a timestamp including tombstones in stable order', async () => {
      const api = handlers();
      const first = await api.create({
        projectId,
        organizationId: orgId,
        title: 'Older',
        actor,
      });
      const second = await api.create({
        projectId,
        organizationId: orgId,
        title: 'Newer',
        actor,
      });
      expect(first.isOk() && second.isOk()).toBe(true);
      if (!first.isOk() || !second.isOk()) {
        return;
      }
      await api.delete({
        noteId: first.value.view.id,
        projectId,
        organizationId: orgId,
        actor,
      });

      const page = await api.listChanged({
        organizationId: orgId,
        since: '2026-10-12T18:00:00.000Z',
        limit: 1,
      });
      expect(page.isOk()).toBe(true);
      if (page.isOk()) {
        expect(page.value.total).toBe(2);
        expect(page.value.hasMore).toBe(true);
        expect(page.value.nextCursor).toBeTruthy();
        const next = await api.listChanged({
          organizationId: orgId,
          since: '2026-10-12T18:00:00.000Z',
          limit: 1,
          cursor: page.value.nextCursor ?? undefined,
        });
        expect(next.isOk()).toBe(true);
        if (next.isOk()) {
          const kinds = [page.value.changes[0]?.kind, next.value.changes[0]?.kind];
          expect(kinds).toContain('deleted');
          expect(kinds).toContain('upserted');
          expect(next.value.hasMore).toBe(false);
        }
      }

      const foreign = await api.listChanged({
        organizationId: otherOrg,
        since: '2020-01-01T00:00:00.000Z',
      });
      expect(foreign.isOk()).toBe(true);
      if (foreign.isOk()) {
        expect(foreign.value.total).toBe(0);
      }
    });

    it('imports from Obsidian as the org person and refuses a stale base version', async () => {
      const api = handlers();
      const created = await api.create({
        projectId,
        organizationId: orgId,
        title: 'Meeting notes',
        body: 'Draft',
        actor,
      });
      expect(created.isOk()).toBe(true);
      if (!created.isOk()) {
        return;
      }

      const bot = {
        kind: 'bot' as const,
        tokenId: 'tok',
        userId: 'bot-1',
        name: 'Libby',
        via: 'token' as const,
      };
      const imported = await api.importFromObsidian({
        organizationId: orgId,
        projectId,
        noteId: created.value.view.id,
        title: 'Meeting notes',
        body: 'From Obsidian',
        baseVersion: created.value.view.version,
        actor: bot,
      });
      expect(imported.isOk()).toBe(true);
      if (imported.isOk()) {
        expect(imported.value.view.body).toBe('From Obsidian');
        expect(imported.value.view.updatedByName).toBe('Lane');
        expect(imported.value.event.type).toBe('NoteUpdated');
        if (imported.value.event.type === 'NoteUpdated') {
          expect(imported.value.event.origin).toBe('obsidian');
        }
      }

      const conflict = await api.importFromObsidian({
        organizationId: orgId,
        projectId,
        noteId: created.value.view.id,
        title: 'Meeting notes',
        body: 'Stale',
        baseVersion: created.value.view.version,
        actor: bot,
      });
      expect(conflict.isErr()).toBe(true);
      if (conflict.isErr()) {
        expect(conflict.error.type).toBe('NOTE_SYNC_CONFLICT');
      }

      const refused = await api.importFromObsidian({
        organizationId: orgId,
        projectId,
        noteId: created.value.view.id,
        title: 'Meeting notes',
        body: 'Nope',
        baseVersion: '99',
        actor,
      });
      expect(refused.isErr()).toBe(true);
      if (refused.isErr()) {
        expect(refused.error.type).toBe('NOTE_IMPORT_REQUIRES_BOT');
      }

      const otherBot = {
        kind: 'bot' as const,
        tokenId: 'tok-2',
        userId: 'bot-2',
        name: 'Other helper',
        via: 'token' as const,
      };
      const notMirror = await api.importFromObsidian({
        organizationId: orgId,
        projectId,
        noteId: created.value.view.id,
        title: 'Meeting notes',
        body: 'Other bot',
        baseVersion: created.value.view.version,
        actor: otherBot,
      });
      expect(notMirror.isErr()).toBe(true);
      if (notMirror.isErr()) {
        expect(notMirror.error.type).toBe('NOTE_IMPORT_REQUIRES_MIRROR_BOT');
      }
    });

    it('pages most recently edited first with a stable cursor', async () => {
      const api = handlers();
      const first = await api.create({
        projectId,
        organizationId: orgId,
        title: 'Older',
        actor,
      });
      const second = await api.create({
        projectId,
        organizationId: orgId,
        title: 'Newer',
        actor,
      });
      expect(first.isOk() && second.isOk()).toBe(true);

      const page = await api.list({ projectId, organizationId: orgId, limit: 1 });
      expect(page.isOk()).toBe(true);
      if (page.isOk()) {
        expect(page.value.items[0]?.title).toBe('Newer');
        expect(page.value.hasMore).toBe(true);
        expect(page.value.nextCursor).toBeTruthy();
        const next = await api.list({
          projectId,
          organizationId: orgId,
          limit: 1,
          cursor: page.value.nextCursor ?? undefined,
        });
        expect(next.isOk()).toBe(true);
        if (next.isOk()) {
          expect(next.value.items[0]?.title).toBe('Older');
          expect(next.value.hasMore).toBe(false);
        }
      }
    });
  });
};

describe('built-in notes backend', () => {
  runNotesBackendContract('fake', () => {
    const backend = createFakeNotesBackend();
    return {
      backend,
      uow: createInMemoryUnitOfWork({
        participants: [createFakeNotesParticipant(backend)],
      }),
    };
  });
});

describe('sqlite notes backend', () => {
  let db: Database;

  runNotesBackendContract(
    'sqlite',
    async () => {
      const opened = openDatabase({ type: 'memory' });
      db = opened.database;
      await runMigrations(db, migrations);
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
      return {
        backend: createSqliteNotesStore(db, {
          loadProject: (id) => okAsync(id === projectId ? project : null),
          loadNoteActors: () =>
            okAsync([{ id: userId, name: 'Lane', email: 'lane@example.com' }]),
        }),
        uow: createSqliteUnitOfWork({
          client: opened.writeClient,
          participants: [notesSqlParticipant],
        }),
      };
    },
    async () => {
      await db.close();
    }
  );
});
