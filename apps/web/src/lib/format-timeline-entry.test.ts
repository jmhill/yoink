import { describe, it, expect } from 'vitest';
import {
  formatFinishedByLine,
  formatHistoryStartsLine,
  formatTimelineLine,
  joinChangedFields,
  shouldShowHistoryStartLine,
} from './format-timeline-entry.js';
import type { TimelineEntry } from '@yoink/api-contracts';

const entry = (overrides: Partial<TimelineEntry> & Pick<TimelineEntry, 'details' | 'kind'>): TimelineEntry => ({
  id: 'log-1',
  occurredAt: '2026-10-12T20:04:00.000Z',
  actor: { userId: 'u1', kind: 'user', name: 'Lane' },
  subject: { type: 'task', id: 't1', title: 'Call Trident', deleted: false },
  ...overrides,
});

describe('formatTimelineLine', () => {
  it('formats a completion the way Polly reads it', () => {
    const line = formatTimelineLine(
      entry({ kind: 'TaskCompleted', details: { kind: 'TaskCompleted' } })
    );
    expect(line.startsWith("Lane completed 'Call Trident' ·")).toBe(true);
  });

  it('names each task field that changed', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'TaskUpdated',
          details: { kind: 'TaskUpdated', title: 'New' },
        })
      )
    ).toContain('Lane changed title');
    expect(
      formatTimelineLine(
        entry({
          kind: 'TaskUpdated',
          details: { kind: 'TaskUpdated', title: 'New', dueDate: '2026-10-20' },
        })
      )
    ).toContain('Lane changed title and due date');
    expect(
      formatTimelineLine(
        entry({
          kind: 'TaskUpdated',
          details: {
            kind: 'TaskUpdated',
            title: 'New',
            dueDate: null,
            assigneeId: 'u2',
            listId: 'l1',
          },
        })
      )
    ).toContain('Lane changed title, due date, owner and list');
    expect(
      formatTimelineLine(
        entry({
          kind: 'TaskUpdated',
          details: { kind: 'TaskUpdated', assigneeId: null, listId: null },
        })
      )
    ).toContain('Lane changed owner and list');
  });

  it('names each project field that changed', () => {
    expect(
      formatTimelineLine(
        entry({
          kind: 'ProjectUpdated',
          details: { kind: 'ProjectUpdated', name: 'Kitchen' },
          subject: { type: 'project', id: 'p1', title: 'Kitchen', deleted: false },
        })
      )
    ).toContain('Lane changed name');
    expect(
      formatTimelineLine(
        entry({
          kind: 'ProjectUpdated',
          details: { kind: 'ProjectUpdated', objective: 'Finish the wall' },
          subject: { type: 'project', id: 'p1', title: 'Kitchen', deleted: false },
        })
      )
    ).toContain('Lane changed objective');
    expect(
      formatTimelineLine(
        entry({
          kind: 'ProjectUpdated',
          details: { kind: 'ProjectUpdated', name: 'Kitchen', objective: null },
          subject: { type: 'project', id: 'p1', title: 'Kitchen', deleted: false },
        })
      )
    ).toContain('Lane changed name and objective');
  });

  it.each([
    ['cleared', 'cleared'],
    ['completed', 'completed'],
    ['deleted', 'deleted'],
    ['removedFromProject', 'removed from the project'],
    ['projectDone', 'project marked done'],
  ] as const)('says the next-action clear reason %s in plain English', (reason, copy) => {
    const line = formatTimelineLine(
      entry({
        kind: 'ProjectNextActionCleared',
        details: {
          kind: 'ProjectNextActionCleared',
          taskId: 't1',
          taskTitle: 'Call Trident',
          reason,
        },
        subject: { type: 'project', id: 'p1', title: 'Kitchen', deleted: false },
      })
    );
    expect(line).toContain(`cleared the next action 'Call Trident' (${copy})`);
  });

  it('renders the import entry as actor · Moved in · N tasks', () => {
    const two = formatTimelineLine(
      entry({
        kind: 'ProjectImported',
        details: { kind: 'ProjectImported', taskCount: 2 },
        subject: { type: 'project', id: 'p1', title: 'Garden', deleted: false },
      })
    );
    expect(two).toBe('Lane · Moved in · 2 tasks');
    const one = formatTimelineLine(
      entry({
        kind: 'ProjectImported',
        details: { kind: 'ProjectImported', taskCount: 1 },
        subject: { type: 'project', id: 'p1', title: 'Garden', deleted: false },
      })
    );
    expect(one).toBe('Lane · Moved in · 1 task');
  });
});

describe('joinChangedFields', () => {
  it('joins one, two, and many fields', () => {
    expect(joinChangedFields(['title'])).toBe('title');
    expect(joinChangedFields(['title', 'due date'])).toBe('title and due date');
    expect(joinChangedFields(['title', 'due date', 'owner'])).toBe(
      'title, due date and owner'
    );
  });
});

describe('formatFinishedByLine', () => {
  it('prints Finished by name · date', () => {
    expect(
      formatFinishedByLine({
        name: 'Lane',
        completedAt: '2026-10-11T15:04:00.000Z',
      })
    ).toBe('Finished by Lane · Oct 11, 2026');
  });
});

describe('formatHistoryStartsLine', () => {
  it('prints History starts Oct 10, 2026', () => {
    expect(formatHistoryStartsLine()).toBe('History starts Oct 10, 2026');
  });
});

describe('shouldShowHistoryStartLine', () => {
  it('shows only when the project predates the start and there are no more pages', () => {
    expect(
      shouldShowHistoryStartLine({
        hasMore: false,
        createdAt: '2026-10-09T12:00:00.000Z',
        historyStartsAt: '2026-10-10T13:56:00.000Z',
      })
    ).toBe(true);
    expect(
      shouldShowHistoryStartLine({
        hasMore: true,
        createdAt: '2026-10-09T12:00:00.000Z',
        historyStartsAt: '2026-10-10T13:56:00.000Z',
      })
    ).toBe(false);
    expect(
      shouldShowHistoryStartLine({
        hasMore: false,
        createdAt: '2026-10-11T12:00:00.000Z',
        historyStartsAt: '2026-10-10T13:56:00.000Z',
      })
    ).toBe(false);
  });
});

describe('formatTimelineLine for membership', () => {
  it('says moved in for TaskAddedToProject', () => {
    const line = formatTimelineLine(
      entry({
        kind: 'TaskAddedToProject',
        details: { kind: 'TaskAddedToProject', projectId: 'p1' },
      })
    );
    expect(line.startsWith("Lane moved 'Call Trident' in ·")).toBe(true);
  });
});
