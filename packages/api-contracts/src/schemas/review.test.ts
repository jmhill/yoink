import { describe, expect, it } from 'vitest';
import { ReviewPageSchema, ReviewQuerySchema } from './review.js';

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
