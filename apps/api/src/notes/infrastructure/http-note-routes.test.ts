import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestAppWithWebAuthn,
  TEST_TOKEN,
  TEST_ORG_ID,
  TEST_SESSION_ID,
  TEST_SESSION_COOKIE,
} from '../../tests/helpers/test-app.js';
import type { FastifyInstance } from 'fastify';
import type { Note, NoteChangePage, NoteListPage, Project } from '@yoink/api-contracts';

describe('note HTTP routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestAppWithWebAuthn();
  });

  const session = { cookies: { [TEST_SESSION_COOKIE]: TEST_SESSION_ID } };
  const bearer = { authorization: `Bearer ${TEST_TOKEN}` };

  const createProject = async (): Promise<Project> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      cookies: session.cookies,
      payload: { name: 'Garden' },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Project>();
  };

  it('creates, lists without bodies, reads, edits, and soft-deletes', async () => {
    const project = await createProject();

    const created = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/notes`,
      headers: bearer,
      payload: { title: 'Meeting notes', body: 'First line\n\nMore' },
    });
    expect(created.statusCode).toBe(201);
    const note = created.json<Note>();
    expect(note.title).toBe('Meeting notes');
    expect(note.body).toBe('First line\n\nMore');
    expect(note.version).toBe('1');
    expect(note.createdAt).toBeTruthy();
    expect(note.updatedAt).toBeTruthy();
    expect(note.organizationId).toBe(TEST_ORG_ID);

    const listed = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/notes`,
      headers: bearer,
    });
    expect(listed.statusCode).toBe(200);
    const page = listed.json<NoteListPage>();
    expect(page.total).toBe(1);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(page.notes[0]?.excerpt).toBe('First line');
    expect(page.notes[0]).not.toHaveProperty('body');

    const read = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/notes/${note.id}`,
      headers: bearer,
    });
    expect(read.statusCode).toBe(200);
    expect(read.json<Note>().body).toBe('First line\n\nMore');

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}/notes/${note.id}`,
      headers: bearer,
      payload: { title: 'Renamed', expectedVersion: note.version },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<Note>().version).toBe('2');

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}/notes/${note.id}`,
      cookies: session.cookies,
      payload: {},
    });
    expect(removed.statusCode).toBe(204);

    const missing = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/notes/${note.id}`,
      headers: bearer,
    });
    expect(missing.statusCode).toBe(404);
  });

  it('lets a bot token write the same note body and refuses a stale save', async () => {
    const project = await createProject();
    const minted = await app.inject({
      method: 'POST',
      url: `/api/organizations/${TEST_ORG_ID}/agents`,
      cookies: session.cookies,
      payload: { name: 'Lane' },
    });
    expect(minted.statusCode).toBe(201);
    const { rawToken } = minted.json<{ rawToken: string }>();
    const bot = { authorization: `Bearer ${rawToken}` };

    const created = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/notes`,
      headers: bot,
      payload: { title: 'Bot note', body: 'From Lane' },
    });
    expect(created.statusCode).toBe(201);
    const note = created.json<Note>();
    expect(note.body).toBe('From Lane');

    await app.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}/notes/${note.id}`,
      headers: bearer,
      payload: { body: 'Person saved first', expectedVersion: note.version },
    });

    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}/notes/${note.id}`,
      headers: bot,
      payload: { body: 'Old copy', expectedVersion: note.version },
    });
    expect(stale.statusCode).toBe(409);
    const body = stale.json<{
      code: string;
      message: string;
      currentVersion: string;
    }>();
    expect(body.code).toBe('STALE_NOTE');
    expect(body.message).toBe('This note changed since you opened it');
    expect(body.currentVersion).toBe('2');
  });

  it('returns 404 for an unknown note and 400 for a blank title', async () => {
    const project = await createProject();
    const missing = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/notes/99999999-9999-4999-8999-999999999999`,
      headers: bearer,
    });
    expect(missing.statusCode).toBe(404);

    const blank = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/notes`,
      headers: bearer,
      payload: { title: '  ' },
    });
    expect(blank.statusCode).toBe(400);
    expect(blank.json<{ code: string }>().code).toBe('NOTE_TITLE_BLANK');
  });

  it('includes note entries on the project timeline', async () => {
    const project = await createProject();
    const created = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/notes`,
      headers: bearer,
      payload: { title: 'Meeting notes', body: 'Hello' },
    });
    expect(created.statusCode).toBe(201);

    const history = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/history`,
      headers: bearer,
    });
    expect(history.statusCode).toBe(200);
    const kinds = history
      .json<{ entries: Array<{ kind: string }> }>()
      .entries.map((entry) => entry.kind);
    expect(kinds).toContain('NoteCreated');
  });

  it('pages the changed-since feed including delete tombstones', async () => {
    const project = await createProject();
    const first = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/notes`,
      headers: bearer,
      payload: { title: 'Older', body: 'One' },
    });
    const second = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/notes`,
      headers: bearer,
      payload: { title: 'Newer', body: 'Two' },
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    const older = first.json<Note>();

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}/notes/${older.id}`,
      cookies: session.cookies,
      payload: {},
    });
    expect(removed.statusCode).toBe(204);

    const page = await app.inject({
      method: 'GET',
      url: `/api/notes/changed?since=2020-01-01T00:00:00.000Z&limit=1`,
      headers: bearer,
    });
    expect(page.statusCode).toBe(200);
    const body = page.json<NoteChangePage>();
    expect(body.total).toBe(2);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBeTruthy();

    const next = await app.inject({
      method: 'GET',
      url: `/api/notes/changed?since=2020-01-01T00:00:00.000Z&limit=1&cursor=${encodeURIComponent(body.nextCursor ?? '')}`,
      headers: bearer,
    });
    expect(next.statusCode).toBe(200);
    const nextBody = next.json<NoteChangePage>();
    expect(nextBody.hasMore).toBe(false);
    const tombstone = [body.changes[0], nextBody.changes[0]].find((change) => change?.kind === 'deleted');
    expect(tombstone?.id).toBe(older.id);
    expect(tombstone?.projectId).toBe(project.id);
    expect(tombstone?.deletedAt).toBeTruthy();
  });

  it('imports an Obsidian edit as the org person and flags a base-version conflict', async () => {
    const project = await createProject();
    const created = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/notes`,
      headers: bearer,
      payload: { title: 'Meeting notes', body: 'Draft' },
    });
    expect(created.statusCode).toBe(201);
    const note = created.json<Note>();

    const minted = await app.inject({
      method: 'POST',
      url: `/api/organizations/${TEST_ORG_ID}/agents`,
      cookies: session.cookies,
      payload: { name: 'Libby notes-mirror' },
    });
    expect(minted.statusCode).toBe(201);
    const { rawToken } = minted.json<{ rawToken: string }>();
    const bot = { authorization: `Bearer ${rawToken}` };

    const imported = await app.inject({
      method: 'POST',
      url: '/api/notes/import',
      headers: bot,
      payload: {
        projectId: project.id,
        noteId: note.id,
        title: 'Meeting notes',
        body: 'From Obsidian',
        baseVersion: note.version,
      },
    });
    expect(imported.statusCode).toBe(200);
    const view = imported.json<Note>();
    expect(view.body).toBe('From Obsidian');
    expect(view.updatedById).toBe(note.createdById);
    expect(view.updatedByName).toBe('seed@localhost');

    const history = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/history`,
      headers: bearer,
    });
    expect(history.statusCode).toBe(200);
    const entries = history.json<{
      entries: Array<{
        kind: string;
        actor: { name: string };
        details: { origin?: string };
      }>;
    }>().entries;
    const obsidian = entries.find((entry) => entry.details.origin === 'obsidian');
    expect(obsidian?.kind).toBe('NoteUpdated');
    expect(obsidian?.actor.name).toBe('seed@localhost');

    const conflict = await app.inject({
      method: 'POST',
      url: '/api/notes/import',
      headers: bot,
      payload: {
        projectId: project.id,
        noteId: note.id,
        title: 'Meeting notes',
        body: 'Stale vault copy',
        baseVersion: note.version,
      },
    });
    expect(conflict.statusCode).toBe(409);
    const conflictBody = conflict.json<{
      code: string;
      currentVersion: string;
      body: string;
    }>();
    expect(conflictBody.code).toBe('NOTE_SYNC_CONFLICT');
    expect(conflictBody.currentVersion).toBe(view.version);
    expect(conflictBody.body).toBe('From Obsidian');

    const personImport = await app.inject({
      method: 'POST',
      url: '/api/notes/import',
      headers: bearer,
      payload: {
        projectId: project.id,
        noteId: note.id,
        title: 'Meeting notes',
        body: 'Person should not impersonate',
        baseVersion: view.version,
      },
    });
    expect(personImport.statusCode).toBe(403);
    expect(personImport.json<{ code: string }>().code).toBe('NOTE_IMPORT_REQUIRES_BOT');

    const otherMinted = await app.inject({
      method: 'POST',
      url: `/api/organizations/${TEST_ORG_ID}/agents`,
      cookies: session.cookies,
      payload: { name: 'Other helper' },
    });
    expect(otherMinted.statusCode).toBe(201);
    const otherToken = otherMinted.json<{ rawToken: string }>().rawToken;
    const otherBot = { authorization: `Bearer ${otherToken}` };
    const otherImport = await app.inject({
      method: 'POST',
      url: '/api/notes/import',
      headers: otherBot,
      payload: {
        projectId: project.id,
        noteId: note.id,
        title: 'Meeting notes',
        body: 'Other bot must not import',
        baseVersion: view.version,
      },
    });
    expect(otherImport.statusCode).toBe(403);
    expect(otherImport.json<{ code: string }>().code).toBe('NOTE_IMPORT_REQUIRES_MIRROR_BOT');

    const missingProject = await app.inject({
      method: 'POST',
      url: '/api/notes/import',
      headers: bot,
      payload: {
        projectId: '99999999-9999-4999-8999-999999999999',
        title: 'Nope',
        body: 'Other org',
      },
    });
    expect(missingProject.statusCode).toBe(404);

    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}/notes/${note.id}`,
      headers: bearer,
      payload: { body: 'Old web copy', expectedVersion: note.version },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json<{ code: string }>().code).toBe('STALE_NOTE');
  });
});
