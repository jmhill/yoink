import { describe, it, expect } from 'vitest';
import type { Note } from '@yoink/api-contracts';
import { decideImportNote } from './decide-import.js';
import type { ImportNoteFromObsidianCommand } from './note-commands.js';

const current: Note = {
  id: 'note-1',
  organizationId: 'org-1',
  projectId: 'project-1',
  title: 'Meeting notes',
  body: 'First line',
  version: '2',
  createdAt: '2026-10-12T18:00:00.000Z',
  createdById: 'user-1',
  createdByName: 'Justin',
  updatedAt: '2026-10-12T18:10:00.000Z',
  updatedById: 'user-1',
  updatedByName: 'Justin',
};

const command = (
  overrides: Partial<ImportNoteFromObsidianCommand> = {}
): ImportNoteFromObsidianCommand => ({
  organizationId: 'org-1',
  projectId: 'project-1',
  noteId: 'note-1',
  title: 'Meeting notes',
  body: 'Edited in Obsidian',
  baseVersion: '2',
  actor: { kind: 'bot', tokenId: 'tok', userId: 'bot-1', name: 'Libby', via: 'token' },
  ...overrides,
});

describe('decideImportNote', () => {
  it('creates a new note with Obsidian origin when no note id is sent', () => {
    const result = decideImportNote({
      command: command({ noteId: undefined, baseVersion: undefined, title: 'New from vault' }),
      current: null,
      authorUserId: 'user-1',
      nextId: 'note-2',
      nextVersion: '1',
      now: '2026-10-13T18:00:00.000Z',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'NoteCreated') {
      expect(result.value.origin).toBe('obsidian');
      expect(result.value.createdById).toBe('user-1');
      expect(result.value.title).toBe('New from vault');
    } else {
      expect(result.isOk() && result.value.type).toBe('NoteCreated');
    }
  });

  it('updates when the base version still matches', () => {
    const result = decideImportNote({
      command: command(),
      current,
      authorUserId: 'user-1',
      nextId: 'unused',
      nextVersion: '3',
      now: '2026-10-13T18:05:00.000Z',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'NoteUpdated') {
      expect(result.value.origin).toBe('obsidian');
      expect(result.value.version).toBe('3');
      expect(result.value.body).toBe('Edited in Obsidian');
      expect(result.value.bodyChanged).toBe(true);
    } else {
      expect(result.isOk() && result.value.type).toBe('NoteUpdated');
    }
  });

  it('returns a sync conflict with current content when the base version is stale', () => {
    const result = decideImportNote({
      command: command({ baseVersion: '1' }),
      current,
      authorUserId: 'user-1',
      nextId: 'unused',
      nextVersion: '3',
      now: '2026-10-13T18:05:00.000Z',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.type === 'NOTE_SYNC_CONFLICT') {
      expect(result.error.currentVersion).toBe('2');
      expect(result.error.title).toBe('Meeting notes');
      expect(result.error.body).toBe('First line');
    } else {
      expect(result.isErr() && result.error.type).toBe('NOTE_SYNC_CONFLICT');
    }
  });

  it('is a no-op when title and body already match', () => {
    const result = decideImportNote({
      command: command({ body: 'First line' }),
      current,
      authorUserId: 'user-1',
      nextId: 'unused',
      nextVersion: '3',
      now: '2026-10-13T18:05:00.000Z',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.type).toBe('unchanged');
    }
  });

  it('refuses an unknown note id instead of creating over a delete', () => {
    const result = decideImportNote({
      command: command({ noteId: 'missing' }),
      current: null,
      authorUserId: 'user-1',
      nextId: 'note-9',
      nextVersion: '1',
      now: '2026-10-13T18:05:00.000Z',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('NOTE_NOT_FOUND');
    }
  });
});
