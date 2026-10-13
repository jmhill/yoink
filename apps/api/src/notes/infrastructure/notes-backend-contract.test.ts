import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Project } from '@yoink/api-contracts';
import { okAsync } from 'neverthrow';
import { createTestDatabase } from '../../database/test-utils.js';
import type { Database } from '../../database/types.js';
import { createNoteHandlers } from '../application/create-note-handlers.js';
import type { NotesBackend } from '../application/ports.js';
import { createFakeNotesBackend } from './fake-notes-backend.js';
import { createSqliteNotesBackend } from './sqlite-notes-backend.js';

const orgId = '11111111-1111-4111-8111-111111111111';
const otherOrg = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';
const otherProject = '44444444-4444-4444-8444-444444444444';
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

const actor = { kind: 'user' as const, userId, via: 'session' as const };

const runNotesBackendContract = (
  name: string,
  createBackend: () => NotesBackend | Promise<NotesBackend>,
  cleanup?: () => Promise<void>
) => {
  describe(`NotesBackend contract [${name}]`, () => {
    let backend: NotesBackend;
    let ids = 0;
    let nowMs = Date.parse('2026-10-12T18:00:00.000Z');

    beforeEach(async () => {
      backend = await createBackend();
      ids = 0;
      nowMs = Date.parse('2026-10-12T18:00:00.000Z');
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
    });

    const handlers = () =>
      createNoteHandlers({
        backend,
        loadProject: (id) => okAsync(id === projectId ? project : null),
        loadActorName: () => okAsync('Lane'),
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
  runNotesBackendContract('fake', () => createFakeNotesBackend());
});

describe('sqlite notes backend', () => {
  let db: Database;

  runNotesBackendContract(
    'sqlite',
    async () => {
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
      return createSqliteNotesBackend(db);
    },
    async () => {
      await db.close();
    }
  );
});
