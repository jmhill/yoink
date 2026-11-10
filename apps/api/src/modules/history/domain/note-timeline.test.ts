import { describe, expect, it } from 'vitest';
import type { IntegrationEvent } from '../../../kernel/integration-event.js';
import { NOTE_TIMELINE_BUILDERS } from './note-timeline.js';

const actor = { kind: 'user' as const, userId: 'user-1', via: 'session' as const };

const event = (
  type: string,
  payload: Record<string, unknown>,
  projectId = 'project-1'
): IntegrationEvent => ({
  id: 'event-1',
  type,
  schemaVersion: 1,
  organizationId: 'org-1',
  occurredAt: '2026-10-12T18:00:00.000Z',
  actor,
  subject: { type: 'note', id: 'note-1', projectId },
  payload,
});

describe('note timeline builders', () => {
  it('builds a NoteCreated row on the note subject', () => {
    const [record] = NOTE_TIMELINE_BUILDERS.NoteCreated?.(
      event('NoteCreated', { title: 'Meeting notes' })
    ) ?? [];
    expect(record?.kind).toBe('NoteCreated');
    expect(record?.subjectType).toBe('note');
    expect(record?.subjectId).toBe('note-1');
    expect(record?.projectId).toBe('project-1');
    expect(record?.hidden).toBe(false);
  });

  it('records title and body flags, not the body', () => {
    const [record] = NOTE_TIMELINE_BUILDERS.NoteUpdated?.(
      event('NoteUpdated', { title: 'Renamed', titleChanged: true, bodyChanged: true })
    ) ?? [];
    expect(record?.kind).toBe('NoteUpdated');
    expect(record?.payload).toEqual({
      title: 'Renamed',
      titleChanged: true,
      bodyChanged: true,
    });
  });

  it('marks an Obsidian-origin update in the payload', () => {
    const [record] = NOTE_TIMELINE_BUILDERS.NoteUpdated?.(
      event('NoteUpdated', {
        title: 'Meeting notes',
        titleChanged: false,
        bodyChanged: true,
        origin: 'obsidian',
      })
    ) ?? [];
    expect(record?.payload).toMatchObject({ origin: 'obsidian' });
  });

  it('builds a NoteDeleted row with the last title', () => {
    const [record] = NOTE_TIMELINE_BUILDERS.NoteDeleted?.(
      event('NoteDeleted', { title: 'Meeting notes' })
    ) ?? [];
    expect(record?.kind).toBe('NoteDeleted');
    expect(record?.payload).toEqual({ title: 'Meeting notes' });
  });
});
