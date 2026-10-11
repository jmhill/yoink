import { describe, it, expect } from 'vitest';
import { formatHistoryStartsLine, formatTimelineLine } from './format-timeline-entry.js';
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

  it('marks a next-action clear after a delete', () => {
    const line = formatTimelineLine(
      entry({
        kind: 'ProjectNextActionCleared',
        details: {
          kind: 'ProjectNextActionCleared',
          taskId: 't1',
          taskTitle: 'Call Trident',
          reason: 'deleted',
        },
        subject: { type: 'project', id: 'p1', title: 'Kitchen', deleted: false },
      })
    );
    expect(line).toContain('cleared the next action (deleted)');
  });
});

describe('formatHistoryStartsLine', () => {
  it('prints History starts Oct 10, 2026', () => {
    expect(formatHistoryStartsLine()).toBe('History starts Oct 10, 2026');
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
