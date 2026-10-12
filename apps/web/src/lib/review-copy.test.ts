import { describe, expect, it } from 'vitest';
import type { Project, ReviewProject } from '@yoink/api-contracts';
import {
  dayLabel,
  formatLastChangeLine,
  formatWaitingRowCopy,
  reviewSubcopy,
} from './review-copy';

const project = (overrides: Partial<Project> = {}): Project => ({
  id: '550e8400-e29b-41d4-a716-446655440010',
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Trusts',
  status: 'waiting',
  waitingOn: 'Mike',
  waitingSince: '2026-09-23',
  nextActionTaskId: null,
  notebookPages: [],
  createdById: '550e8400-e29b-41d4-a716-446655440002',
  createdAt: '2026-10-01T10:00:00.000Z',
  lastChangedAt: '2026-10-03T17:00:00.000Z',
  lastChangedBy: null,
  ...overrides,
});

const item = (overrides: Partial<ReviewProject> = {}): ReviewProject => ({
  project: project(),
  reasons: ['waiting'],
  lastChangeAt: '2026-10-03T17:00:00.000Z',
  daysSinceChange: 9,
  daysWaiting: 19,
  nextAction: null,
  ...overrides,
});

describe('review copy', () => {
  it('uses singular and plural day labels', () => {
    expect(dayLabel(1)).toBe('1 day');
    expect(dayLabel(2)).toBe('2 days');
    expect(dayLabel(0)).toBe('0 days');
  });

  it('formats last change and waiting rows', () => {
    expect(formatLastChangeLine(item(), 'America/Chicago')).toMatch(/^Last change Oct \d+ · 9 days$/);
    expect(formatWaitingRowCopy(item(), '2026-10-12')).toBe('Since Sep 23 · 19 days');
    expect(
      formatWaitingRowCopy(
        item({ project: project({ waitingSince: '2026-10-12' }), daysWaiting: 0 }),
        '2026-10-12'
      )
    ).toBe('Since today');
    expect(
      formatWaitingRowCopy(item({ project: project({ waitingSince: null }), daysWaiting: null }), '2026-10-12')
    ).toBe('Waiting');
  });

  it('formats the Review subcopy', () => {
    expect(reviewSubcopy(1)).toBe('1 needs attention');
    expect(reviewSubcopy(3)).toBe('3 need attention');
  });
});
