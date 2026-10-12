import { describe, expect, it } from 'vitest';
import { DoneListPageSchema, DoneListQuerySchema, ReviewPageSchema, ReviewQuerySchema } from './review.js';

const project = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  name: 'House storage',
  status: 'active' as const,
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: null,
  notebookPages: [],
  createdById: '550e8400-e29b-41d4-a716-446655440002',
  createdAt: '2026-10-04T13:00:00.000Z',
  lastChangedAt: '2026-10-04T13:00:00.000Z',
  lastChangedBy: '550e8400-e29b-41d4-a716-446655440002',
};

describe('ReviewQuerySchema', () => {
  it('accepts an omitted timeZone and a real IANA zone', () => {
    expect(ReviewQuerySchema.parse({}).timeZone).toBeUndefined();
    expect(ReviewQuerySchema.parse({ timeZone: 'America/Chicago' }).timeZone).toBe(
      'America/Chicago'
    );
  });

  it('rejects a bogus IANA zone', () => {
    expect(ReviewQuerySchema.safeParse({ timeZone: 'Mars/Base' }).success).toBe(false);
  });
});

describe('ReviewPageSchema', () => {
  it('parses a complete attention page', () => {
    const parsed = ReviewPageSchema.parse({
      hasMore: false,
      nextCursor: null,
      total: 1,
      today: '2026-10-12',
      counts: { noNextAction: 1, quiet: 0, waiting: 0 },
      projects: [
        {
          project,
          reasons: ['noNextAction'],
          lastChangeAt: '2026-10-04T13:00:00.000Z',
          daysSinceChange: 8,
          daysWaiting: null,
          nextAction: null,
        },
      ],
    });
    expect(parsed.projects[0]?.reasons).toEqual(['noNextAction']);
    expect(parsed.counts.noNextAction).toBe(1);
  });
});

describe('DoneListQuerySchema', () => {
  it('accepts an omitted week and a Monday date', () => {
    expect(DoneListQuerySchema.parse({}).week).toBeUndefined();
    expect(DoneListQuerySchema.parse({ week: '2026-10-05' }).week).toBe('2026-10-05');
  });

  it('rejects a malformed week date', () => {
    expect(DoneListQuerySchema.safeParse({ week: 'October 5' }).success).toBe(false);
  });
});

describe('DoneListPageSchema', () => {
  it('parses a complete done-list page', () => {
    const parsed = DoneListPageSchema.parse({
      hasMore: false,
      nextCursor: null,
      total: 1,
      timeZone: 'America/Chicago',
      week: { start: '2026-10-05', end: '2026-10-11' },
      previousWeek: '2026-09-28',
      nextWeek: '2026-10-12',
      otherTaskCount: 21,
      groups: [
        {
          project,
          nextAction: null,
          tasks: [
            {
              id: '550e8400-e29b-41d4-a716-446655440101',
              organizationId: project.organizationId,
              createdById: project.createdById,
              title: 'Box the attic',
              createdAt: '2026-10-05T13:00:00.000Z',
              completedAt: '2026-10-10T16:12:00.000Z',
              lastChangedAt: '2026-10-10T16:12:00.000Z',
              lastChangedBy: project.createdById,
              completedBy: project.createdById,
              completedByName: 'Lane',
              projectId: project.id,
            },
          ],
        },
      ],
    });
    expect(parsed.week.start).toBe('2026-10-05');
    expect(parsed.otherTaskCount).toBe(21);
    expect(parsed.groups[0]?.tasks[0]?.completedByName).toBe('Lane');
  });
});
