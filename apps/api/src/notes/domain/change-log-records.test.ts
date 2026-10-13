import { describe, it, expect } from 'vitest';
import { changeLogRecordsFromNoteEvent } from './change-log-records.js';
import type { NoteCreated, NoteDeleted, NoteUpdated } from './events.js';

const actor = { kind: 'user' as const, userId: 'user-1', via: 'session' as const };

describe('changeLogRecordsFromNoteEvent', () => {
  it('builds a NoteCreated record on the note subject', () => {
    const event: NoteCreated = {
      type: 'NoteCreated',
      id: 'note-1',
      organizationId: 'org-1',
      projectId: 'project-1',
      title: 'Meeting notes',
      body: 'Hello',
      version: '1',
      createdById: 'user-1',
      createdAt: '2026-10-12T18:00:00.000Z',
      occurredAt: '2026-10-12T18:00:00.000Z',
    };
    const [record] = changeLogRecordsFromNoteEvent({
      event,
      actor,
      ids: { recordId: 'log-1' },
    });
    expect(record?.kind).toBe('NoteCreated');
    expect(record?.subjectType).toBe('note');
    expect(record?.subjectId).toBe('note-1');
    expect(record?.projectId).toBe('project-1');
    expect(record?.hidden).toBe(false);
  });

  it('records title/body changed flags, not the body', () => {
    const event: NoteUpdated = {
      type: 'NoteUpdated',
      id: 'note-1',
      organizationId: 'org-1',
      projectId: 'project-1',
      title: 'Renamed',
      titleChanged: true,
      bodyChanged: true,
      version: '2',
      occurredAt: '2026-10-12T18:10:00.000Z',
    };
    const [record] = changeLogRecordsFromNoteEvent({
      event,
      actor,
      ids: { recordId: 'log-2' },
    });
    expect(record?.kind).toBe('NoteUpdated');
    if (record?.kind === 'NoteUpdated') {
      expect(record.payload).toEqual({
        title: 'Renamed',
        titleChanged: true,
        bodyChanged: true,
      });
    }
  });

  it('builds a NoteDeleted record with the last title', () => {
    const event: NoteDeleted = {
      type: 'NoteDeleted',
      id: 'note-1',
      organizationId: 'org-1',
      projectId: 'project-1',
      title: 'Meeting notes',
      deletedAt: '2026-10-12T18:20:00.000Z',
      occurredAt: '2026-10-12T18:20:00.000Z',
    };
    const [record] = changeLogRecordsFromNoteEvent({
      event,
      actor,
      ids: { recordId: 'log-3' },
    });
    expect(record?.kind).toBe('NoteDeleted');
    if (record?.kind === 'NoteDeleted') {
      expect(record.payload.title).toBe('Meeting notes');
    }
  });
});
