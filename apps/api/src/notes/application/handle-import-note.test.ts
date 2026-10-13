import { describe, it, expect } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import type { Note, Project } from '@yoink/api-contracts';
import { staleNoteError } from '../domain/note-errors.js';
import { createFakeNotesBackend } from '../test-support/fake-notes-backend.js';
import { handleImportNote } from './handle-import-note.js';

const orgId = '11111111-1111-4111-8111-111111111111';
const projectId = '33333333-3333-4333-8333-333333333333';
const personId = '55555555-5555-4555-8555-555555555555';
const mirrorBotId = '66666666-6666-4666-8666-666666666666';
const otherBotId = '77777777-7777-4777-8777-777777777777';

const project: Project = {
  id: projectId,
  organizationId: orgId,
  name: 'Garden',
  status: 'active',
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: null,
  notebookPages: [],
  createdById: personId,
  createdAt: '2026-10-12T18:00:00.000Z',
  lastChangedAt: '2026-10-12T18:00:00.000Z',
  lastChangedBy: personId,
};

const note: Note = {
  id: '88888888-8888-4888-8888-888888888888',
  organizationId: orgId,
  projectId,
  title: 'Meeting notes',
  body: 'Draft',
  version: '1',
  createdAt: '2026-10-12T18:00:00.000Z',
  createdById: personId,
  createdByName: 'Lane',
  updatedAt: '2026-10-12T18:00:00.000Z',
  updatedById: personId,
  updatedByName: 'Lane',
};

const mirrorBot = {
  kind: 'bot' as const,
  tokenId: 'tok',
  userId: mirrorBotId,
  name: 'Libby notes-mirror',
  via: 'token' as const,
};

const depsFor = (backend: ReturnType<typeof createFakeNotesBackend>) => ({
  backend,
  loadProject: (id: string) => okAsync(id === projectId ? project : null),
  loadOrgPerson: () => okAsync({ userId: personId, name: 'Lane' }),
  loadNotesMirrorBot: () => okAsync(mirrorBotId),
  nextId: () => '00000000-0000-4000-8000-000000000001',
  now: () => '2026-10-13T18:00:00.000Z',
});

describe('handleImportNote', () => {
  it('refuses a bot that is not the designated notes-mirror bot', async () => {
    const result = await handleImportNote(
      {
        organizationId: orgId,
        projectId,
        noteId: note.id,
        title: 'Meeting notes',
        body: 'From the other bot',
        baseVersion: note.version,
        actor: { ...mirrorBot, userId: otherBotId, name: 'Other helper' },
      },
      depsFor(createFakeNotesBackend([note]))
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('NOTE_IMPORT_REQUIRES_MIRROR_BOT');
    }
  });

  it('maps a concurrent persist stale write to NOTE_SYNC_CONFLICT', async () => {
    const current: Note = {
      ...note,
      body: 'Saved while the mirror ran',
      version: '2',
      updatedAt: '2026-10-13T18:01:00.000Z',
    };
    const backend = createFakeNotesBackend([current]);
    const result = await handleImportNote(
      {
        organizationId: orgId,
        projectId,
        noteId: note.id,
        title: 'Meeting notes',
        body: 'From Obsidian',
        baseVersion: note.version,
        actor: mirrorBot,
      },
      {
        ...depsFor(backend),
        backend: {
          ...backend,
          persist: () =>
            errAsync(
              staleNoteError({
                version: current.version,
                updatedAt: current.updatedAt,
                updatedById: current.updatedById,
                updatedByName: current.updatedByName,
              })
            ),
        },
      }
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('NOTE_SYNC_CONFLICT');
      if (result.error.type === 'NOTE_SYNC_CONFLICT') {
        expect(result.error.currentVersion).toBe('2');
        expect(result.error.body).toBe('Saved while the mirror ran');
      }
    }
  });
});
