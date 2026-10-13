import { describe, it, expect } from 'vitest';
import { decideCreateNote } from './decide-create.js';
import type { CreateNoteCommand } from './note-commands.js';

const command = (overrides: Partial<CreateNoteCommand> = {}): CreateNoteCommand => ({
  projectId: 'project-1',
  organizationId: 'org-1',
  title: 'Meeting notes',
  body: 'First line',
  actor: { kind: 'user', userId: 'user-1', via: 'session' },
  ...overrides,
});

describe('decideCreateNote', () => {
  it('creates a note at version 1', () => {
    const result = decideCreateNote({
      command: command(),
      id: 'note-1',
      now: '2026-10-12T18:00:00.000Z',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'NoteCreated',
        id: 'note-1',
        organizationId: 'org-1',
        projectId: 'project-1',
        title: 'Meeting notes',
        body: 'First line',
        version: '1',
        createdById: 'user-1',
        createdAt: '2026-10-12T18:00:00.000Z',
        occurredAt: '2026-10-12T18:00:00.000Z',
      });
    }
  });

  it('allows a bot actor and an empty body', () => {
    const result = decideCreateNote({
      command: command({
        body: undefined,
        actor: { kind: 'bot', tokenId: 'tok', userId: 'bot-1', name: 'Lane', via: 'token' },
      }),
      id: 'note-2',
      now: '2026-10-12T18:00:00.000Z',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.body).toBe('');
      expect(result.value.createdById).toBe('bot-1');
    }
  });

  it('refuses a blank title', () => {
    const result = decideCreateNote({
      command: command({ title: '  ' }),
      id: 'note-1',
      now: '2026-10-12T18:00:00.000Z',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('NOTE_TITLE_BLANK');
    }
  });
});
