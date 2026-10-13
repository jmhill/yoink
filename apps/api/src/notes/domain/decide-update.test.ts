import { describe, it, expect } from 'vitest';
import type { Note } from '@yoink/api-contracts';
import { decideUpdateNote } from './decide-update.js';
import type { UpdateNoteCommand } from './note-commands.js';

const current: Note = {
  id: 'note-1',
  organizationId: 'org-1',
  projectId: 'project-1',
  title: 'Meeting notes',
  body: 'First line',
  version: '1',
  createdAt: '2026-10-12T18:00:00.000Z',
  createdById: 'user-1',
  createdByName: 'Lane',
  updatedAt: '2026-10-12T18:00:00.000Z',
  updatedById: 'user-1',
  updatedByName: 'Lane',
};

const command = (overrides: Partial<UpdateNoteCommand> = {}): UpdateNoteCommand => ({
  noteId: 'note-1',
  projectId: 'project-1',
  organizationId: 'org-1',
  expectedVersion: '1',
  title: 'Renamed',
  actor: { kind: 'user', userId: 'user-1', via: 'session' },
  ...overrides,
});

describe('decideUpdateNote', () => {
  it('refuses a save from an old version and keeps enough to tell who saved', () => {
    const result = decideUpdateNote({
      command: command({ expectedVersion: '0' }),
      current,
      nextVersion: '2',
      now: '2026-10-12T18:10:00.000Z',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr() && result.error.type === 'STALE_NOTE') {
      expect(result.error.currentVersion).toBe('1');
      expect(result.error.updatedByName).toBe('Lane');
      expect(result.error.message).toBe('This note changed since you opened it');
    } else {
      expect(result.isErr() && result.error.type).toBe('STALE_NOTE');
    }
  });

  it('records title and body changes without the full body', () => {
    const result = decideUpdateNote({
      command: command({ title: 'Renamed', body: 'Second line' }),
      current,
      nextVersion: '2',
      now: '2026-10-12T18:10:00.000Z',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.titleChanged).toBe(true);
      expect(result.value.bodyChanged).toBe(true);
      expect(result.value.version).toBe('2');
      expect(result.value.title).toBe('Renamed');
    }
  });

  it('refuses a no-op edit', () => {
    const result = decideUpdateNote({
      command: command({ title: 'Meeting notes', body: 'First line' }),
      current,
      nextVersion: '2',
      now: '2026-10-12T18:10:00.000Z',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('NOTE_UNCHANGED');
    }
  });
});
