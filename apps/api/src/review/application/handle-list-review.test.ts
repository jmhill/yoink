import { describe, expect, it } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import { PILE_SAFETY_CAP } from '@yoink/api-contracts';
import { encodeKeysetCursor } from '../../listing/application/keyset-codec.js';
import { reviewCursor } from '../../listing/domain/list-keys.js';
import { storageError } from '../domain/review-errors.js';
import { REVIEW_SECTION_NEEDS_NEXT } from '../domain/review-order.js';
import type { RankedReviewProject } from '../domain/review-order.js';
import { handleListReview } from './handle-list-review.js';

const ORG = '550e8400-e29b-41d4-a716-446655440001';
const USER = '550e8400-e29b-41d4-a716-446655440002';

const project = (overrides: Partial<Project> & Pick<Project, 'id' | 'name'>): Project => ({
  organizationId: ORG,
  createdById: USER,
  status: 'active',
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: null,
  notebookPages: [],
  createdAt: '2026-10-11T13:00:00.000Z',
  lastChangedAt: '2026-10-11T13:00:00.000Z',
  lastChangedBy: USER,
  ...overrides,
});

const ranked = (name: string, id: string): RankedReviewProject => ({
  project: project({ id, name }),
  reasons: ['noNextAction'],
  lastChangeAt: '2026-10-11T13:00:00.000Z',
  daysSinceChange: 1,
  daysWaiting: null,
  nextAction: null,
  sectionRank: REVIEW_SECTION_NEEDS_NEXT,
  groupOldestSince: '0',
  groupName: '',
  rowWaitingSince: '0',
});

const house = ranked('House storage', '550e8400-e29b-41d4-a716-446655440010');
const NOW = new Date('2026-10-12T17:00:00.000Z');

describe('handleListReview', () => {
  it('loads review once and uses that result for the page and counts', async () => {
    let loads = 0;
    const result = await handleListReview(
      { organizationId: ORG, timeZone: 'America/Chicago' },
      {
        now: () => NOW,
        pageReview: (options) => {
          loads += 1;
          expect(options.organizationId).toBe(ORG);
          expect(options.today).toBe('2026-10-12');
          expect(options.timeZone).toBe('America/Chicago');
          expect(options.fetchLimit).toBe(PILE_SAFETY_CAP + 1);
          return okAsync({
            rows: [house],
            total: 1,
            counts: { noNextAction: 1, quiet: 0, waiting: 0 },
          });
        },
      }
    );

    expect(loads).toBe(1);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.items).toEqual([house]);
    expect(result.value.counts).toEqual({ noNextAction: 1, quiet: 0, waiting: 0 });
    expect(result.value.today).toBe('2026-10-12');
    expect(result.value.total).toBe(1);
    expect(result.value.hasMore).toBe(false);
    expect(result.value.nextCursor).toBeNull();
  });

  it('returns InvalidCursor without loading when the cursor is malformed', async () => {
    let loads = 0;
    const result = await handleListReview(
      { organizationId: ORG, cursor: 'nope' },
      {
        now: () => NOW,
        pageReview: () => {
          loads += 1;
          return errAsync(storageError('store should not load'));
        },
      }
    );

    expect(loads).toBe(0);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_CURSOR');
    }
  });

  it('assembles a page from the same loaded counts when paging', async () => {
    const second = ranked('Quiet garden', '550e8400-e29b-41d4-a716-446655440011');
    const result = await handleListReview(
      { organizationId: ORG, limit: 1 },
      {
        now: () => NOW,
        pageReview: (options) => {
          expect(options.fetchLimit).toBe(2);
          return okAsync({
            rows: [house, second],
            total: 2,
            counts: { noNextAction: 1, quiet: 1, waiting: 0 },
          });
        },
      }
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.items).toEqual([house]);
    expect(result.value.hasMore).toBe(true);
    expect(result.value.nextCursor).toBe(encodeKeysetCursor(reviewCursor.of(house)));
    expect(result.value.total).toBe(2);
    expect(result.value.counts).toEqual({ noNextAction: 1, quiet: 1, waiting: 0 });
  });
});
