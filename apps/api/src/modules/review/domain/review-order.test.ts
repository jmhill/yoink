import { describe, expect, it } from 'vitest';
import type { Project, ReviewProject } from '@yoink/api-contracts';
import {
  compareReview,
  countReviewReasons,
  rankReviewProject,
  reviewSectionRank,
  waitingGroupKey,
  waitingGroupOldestSince,
} from './review-order.js';

const project = (overrides: Partial<Project> & Pick<Project, 'id' | 'name'>): Project => ({
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  createdById: '550e8400-e29b-41d4-a716-446655440002',
  status: 'active',
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: null,
  notebookPages: [],
  createdAt: '2026-10-01T10:00:00.000Z',
  lastChangedAt: '2026-10-01T10:00:00.000Z',
  lastChangedBy: null,
  ...overrides,
});

const item = (
  overrides: Partial<ReviewProject> & { project: Project; reasons: ReviewProject['reasons'] }
): ReviewProject => ({
  lastChangeAt: '2026-10-01T10:00:00.000Z',
  daysSinceChange: 11,
  daysWaiting: null,
  nextAction: null,
  ...overrides,
});

describe('reviewSectionRank', () => {
  it('puts an active no-next-action project first even when it is also quiet', () => {
    const both = item({
      project: project({ id: '550e8400-e29b-41d4-a716-446655440010', name: 'Both' }),
      reasons: ['noNextAction', 'quiet'],
    });
    expect(reviewSectionRank(both)).toBe('0');
  });

  it('keeps a waiting project in the waiting section even without a next action', () => {
    const waiting = item({
      project: project({
        id: '550e8400-e29b-41d4-a716-446655440011',
        name: 'Wait',
        status: 'waiting',
        waitingOn: 'Mike',
      }),
      reasons: ['noNextAction', 'waiting'],
    });
    expect(reviewSectionRank(waiting)).toBe('2');
  });
});

describe('waiting groups', () => {
  it('groups waitingOn case-insensitively after trim', () => {
    expect(waitingGroupKey(' Mike ')).toBe('mike');
    expect(waitingGroupKey('mike')).toBe('mike');
  });

  it('orders groups by oldest waitingSince with nulls last, then name', () => {
    const mikeEarly = item({
      project: project({
        id: '550e8400-e29b-41d4-a716-446655440021',
        name: 'Trusts',
        status: 'waiting',
        waitingOn: 'Mike',
        waitingSince: '2026-09-23',
      }),
      reasons: ['waiting'],
      daysWaiting: 19,
    });
    const mikeLater = item({
      project: project({
        id: '550e8400-e29b-41d4-a716-446655440022',
        name: 'Other Mike',
        status: 'waiting',
        waitingOn: ' mike ',
        waitingSince: '2026-10-01',
      }),
      reasons: ['waiting'],
      daysWaiting: 11,
    });
    const seabrook = item({
      project: project({
        id: '550e8400-e29b-41d4-a716-446655440023',
        name: 'Boat',
        status: 'waiting',
        waitingOn: 'Seabrook',
        waitingSince: '2026-09-25',
      }),
      reasons: ['waiting'],
      daysWaiting: 17,
    });
    const unknown = item({
      project: project({
        id: '550e8400-e29b-41d4-a716-446655440024',
        name: 'Unknown',
        status: 'waiting',
        waitingOn: 'Pat',
        waitingSince: null,
      }),
      reasons: ['waiting'],
    });
    const waitingItems = [mikeEarly, mikeLater, seabrook, unknown];
    const ranked = waitingItems
      .map((row) => rankReviewProject(row, waitingItems))
      .sort(compareReview);

    expect(waitingGroupOldestSince(waitingItems, 'mike')).toBe('2026-09-23');
    expect(ranked.map((row) => row.project.name)).toEqual([
      'Trusts',
      'Other Mike',
      'Boat',
      'Unknown',
    ]);
  });

  it('counts noNextAction for active projects only', () => {
    const active = item({
      project: project({ id: '550e8400-e29b-41d4-a716-446655440041', name: 'House' }),
      reasons: ['noNextAction'],
    });
    const waitingNoNext = item({
      project: project({
        id: '550e8400-e29b-41d4-a716-446655440042',
        name: 'Wait',
        status: 'waiting',
      }),
      reasons: ['noNextAction', 'waiting'],
    });
    const quiet = item({
      project: project({
        id: '550e8400-e29b-41d4-a716-446655440043',
        name: 'Quiet',
        nextActionTaskId: '550e8400-e29b-41d4-a716-446655440101',
      }),
      reasons: ['quiet'],
    });
    expect(countReviewReasons([active, waitingNoNext, quiet])).toEqual({
      noNextAction: 1,
      quiet: 1,
      waiting: 1,
    });
  });

  it('sorts a row with no since date last within its group', () => {
    const dated = item({
      project: project({
        id: '550e8400-e29b-41d4-a716-446655440031',
        name: 'Dated',
        status: 'waiting',
        waitingOn: 'Sam',
        waitingSince: '2026-10-01',
      }),
      reasons: ['waiting'],
      daysWaiting: 11,
    });
    const undated = item({
      project: project({
        id: '550e8400-e29b-41d4-a716-446655440032',
        name: 'Alpha undated',
        status: 'waiting',
        waitingOn: 'Sam',
        waitingSince: null,
      }),
      reasons: ['waiting'],
    });
    const waitingItems = [dated, undated];
    const ranked = waitingItems
      .map((row) => rankReviewProject(row, waitingItems))
      .sort(compareReview);
    expect(ranked.map((row) => row.project.name)).toEqual(['Dated', 'Alpha undated']);
  });
});
