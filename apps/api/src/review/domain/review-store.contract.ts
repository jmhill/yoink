import { describe, it, expect, beforeEach } from 'vitest';
import type { Project, Task } from '@yoink/api-contracts';
import { reviewCursor } from '../../listing/domain/list-keys.js';
import type { ReviewChangeLogEntry, ReviewStore } from './review-store.js';

export const REVIEW_TODAY = '2026-10-12';
export const REVIEW_TIME_ZONE = 'America/Chicago';

export const REVIEW_ORG = '550e8400-e29b-41d4-a716-446655440001';
export const REVIEW_OTHER_ORG = '550e8400-e29b-41d4-a716-446655440099';
export const REVIEW_CREATED_BY = '550e8400-e29b-41d4-a716-446655440002';
export const REVIEW_OTHER_USER = '550e8400-e29b-41d4-a716-446655440098';

export const REVIEW_PROJECT = {
  needsNext: '550e8400-e29b-41d4-a716-446655440010',
  quiet: '550e8400-e29b-41d4-a716-446655440011',
  taskBumped: '550e8400-e29b-41d4-a716-446655440012',
  waitingMike: '550e8400-e29b-41d4-a716-446655440013',
  waitingMikeTwo: '550e8400-e29b-41d4-a716-446655440014',
  waitingNone: '550e8400-e29b-41d4-a716-446655440015',
  someday: '550e8400-e29b-41d4-a716-446655440016',
  otherOrg: '550e8400-e29b-41d4-a716-446655440017',
  deletedTask: '550e8400-e29b-41d4-a716-446655440018',
} as const;

export const REVIEW_TASK = {
  quietNa: '550e8400-e29b-41d4-a716-446655440101',
  bumpedNa: '550e8400-e29b-41d4-a716-446655440102',
  mikeNa: '550e8400-e29b-41d4-a716-446655440103',
  deleted: '550e8400-e29b-41d4-a716-446655440104',
  otherOrgNa: '550e8400-e29b-41d4-a716-446655440105',
} as const;

export const REVIEW_CHANGE = {
  bumpedTask: '550e8400-e29b-41d4-a716-446655440201',
  otherProject: '550e8400-e29b-41d4-a716-446655440202',
  otherOrg: '550e8400-e29b-41d4-a716-446655440203',
  deletedTask: '550e8400-e29b-41d4-a716-446655440204',
} as const;

const lastChanged = {
  lastChangedAt: null,
  lastChangedBy: null,
  completedBy: null,
} as const;

export const reviewTask = (overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
  organizationId: REVIEW_ORG,
  createdById: REVIEW_CREATED_BY,
  createdAt: '2026-10-11T13:00:00.000Z',
  ...lastChanged,
  ...overrides,
});

export const reviewProject = (
  overrides: Partial<Project> & Pick<Project, 'id' | 'name'>
): Project => ({
  organizationId: REVIEW_ORG,
  createdById: REVIEW_CREATED_BY,
  status: 'active',
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: null,
  notebookPages: [],
  createdAt: '2026-10-11T13:00:00.000Z',
  lastChangedAt: '2026-10-11T13:00:00.000Z',
  lastChangedBy: REVIEW_CREATED_BY,
  ...overrides,
});

export const reviewFixtureProjects = (): Project[] => [
  reviewProject({
    id: REVIEW_PROJECT.needsNext,
    name: 'House storage',
  }),
  reviewProject({
    id: REVIEW_PROJECT.quiet,
    name: 'Quiet garden',
    nextActionTaskId: REVIEW_TASK.quietNa,
    createdAt: '2026-10-04T05:00:00.000Z',
    lastChangedAt: '2026-10-04T05:00:00.000Z',
  }),
  reviewProject({
    id: REVIEW_PROJECT.taskBumped,
    name: 'Fresh edit',
    nextActionTaskId: REVIEW_TASK.bumpedNa,
    createdAt: '2026-10-01T05:00:00.000Z',
    lastChangedAt: '2026-10-01T05:00:00.000Z',
  }),
  reviewProject({
    id: REVIEW_PROJECT.waitingMike,
    name: 'Trusts',
    status: 'waiting',
    waitingOn: 'Mike',
    waitingSince: '2026-09-23',
    nextActionTaskId: REVIEW_TASK.mikeNa,
    createdAt: '2026-10-01T05:00:00.000Z',
    lastChangedAt: '2026-10-01T05:00:00.000Z',
  }),
  reviewProject({
    id: REVIEW_PROJECT.waitingMikeTwo,
    name: 'Other Mike',
    status: 'waiting',
    waitingOn: ' mike ',
    waitingSince: '2026-10-01',
  }),
  reviewProject({
    id: REVIEW_PROJECT.waitingNone,
    name: 'Unknown wait',
    status: 'waiting',
    waitingOn: 'Pat',
    waitingSince: null,
  }),
  reviewProject({
    id: REVIEW_PROJECT.someday,
    name: 'Umbrella',
    status: 'someday',
  }),
  reviewProject({
    id: REVIEW_PROJECT.otherOrg,
    name: 'Other org quiet',
    organizationId: REVIEW_OTHER_ORG,
    createdById: REVIEW_OTHER_USER,
    nextActionTaskId: REVIEW_TASK.otherOrgNa,
    createdAt: '2026-10-01T05:00:00.000Z',
    lastChangedAt: '2026-10-01T05:00:00.000Z',
  }),
  reviewProject({
    id: REVIEW_PROJECT.deletedTask,
    name: 'Deleted task change',
    status: 'waiting',
    waitingOn: 'Archivist',
    waitingSince: null,
    nextActionTaskId: REVIEW_TASK.deleted,
    createdAt: '2026-10-01T05:00:00.000Z',
    lastChangedAt: '2026-10-01T05:00:00.000Z',
  }),
];

export const reviewFixtureTasks = (): Task[] => [
  reviewTask({
    id: REVIEW_TASK.quietNa,
    title: 'Water plants',
    projectId: REVIEW_PROJECT.quiet,
  }),
  reviewTask({
    id: REVIEW_TASK.bumpedNa,
    title: 'Rename me',
    projectId: REVIEW_PROJECT.taskBumped,
  }),
  reviewTask({
    id: REVIEW_TASK.mikeNa,
    title: 'Call Mike',
    projectId: REVIEW_PROJECT.waitingMike,
  }),
  reviewTask({
    id: REVIEW_TASK.deleted,
    title: 'Gone',
    projectId: REVIEW_PROJECT.deletedTask,
  }),
  reviewTask({
    id: REVIEW_TASK.otherOrgNa,
    title: 'Other org next',
    organizationId: REVIEW_OTHER_ORG,
    createdById: REVIEW_OTHER_USER,
    projectId: REVIEW_PROJECT.otherOrg,
  }),
];

export const reviewFixtureChangeLog = (): ReviewChangeLogEntry[] => [
  {
    organizationId: REVIEW_ORG,
    projectId: REVIEW_PROJECT.taskBumped,
    occurredAt: '2026-10-12T16:00:00.000Z',
  },
    {
      organizationId: REVIEW_ORG,
      projectId: REVIEW_PROJECT.waitingMike,
      occurredAt: '2026-10-11T16:00:00.000Z',
    },
    {
      organizationId: REVIEW_ORG,
      projectId: REVIEW_PROJECT.needsNext,
      occurredAt: '2026-09-01T10:00:00.000Z',
    },
  {
    organizationId: REVIEW_OTHER_ORG,
    projectId: REVIEW_PROJECT.otherOrg,
    occurredAt: '2026-10-12T18:00:00.000Z',
  },
  {
    organizationId: REVIEW_ORG,
    projectId: REVIEW_PROJECT.deletedTask,
    occurredAt: '2026-10-12T15:00:00.000Z',
  },
];

export type ReviewStoreHarness = {
  store: ReviewStore;
};

const pageAll = (store: ReviewStore) =>
  store.pageReview({
    organizationId: REVIEW_ORG,
    today: REVIEW_TODAY,
    timeZone: REVIEW_TIME_ZONE,
    fetchLimit: 20,
  });

export const runReviewStoreContractTests = (options: {
  createHarness: () => ReviewStoreHarness | Promise<ReviewStoreHarness>;
  beforeEach?: () => void | Promise<void>;
}) => {
  let store: ReviewStore;

  beforeEach(async () => {
    if (options.beforeEach) {
      await options.beforeEach();
    }
    const harness = await options.createHarness();
    store = harness.store;
  });

  describe('ReviewStore contract', () => {
    it('uses a task-only change-log record as last change and ignores other orgs and projects', async () => {
      const result = await pageAll(store);
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      const byId = new Map(result.value.rows.map((row) => [row.project.id, row]));
      expect(byId.has(REVIEW_PROJECT.taskBumped)).toBe(false);

      const trusts = byId.get(REVIEW_PROJECT.waitingMike);
      expect(trusts?.lastChangeAt).toBe('2026-10-11T16:00:00.000Z');
      expect(trusts?.daysSinceChange).toBe(1);

      const quiet = byId.get(REVIEW_PROJECT.quiet);
      expect(quiet?.lastChangeAt).toBe('2026-10-04T05:00:00.000Z');
      expect(quiet?.daysSinceChange).toBe(8);
      expect(quiet?.reasons).toEqual(['quiet']);

      expect(byId.has(REVIEW_PROJECT.otherOrg)).toBe(false);
    });

    it('still counts a deleted task change-log record toward last change', async () => {
      const result = await pageAll(store);
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      const deleted = result.value.rows.find(
        (row) => row.project.id === REVIEW_PROJECT.deletedTask
      );
      expect(deleted?.lastChangeAt).toBe('2026-10-12T15:00:00.000Z');
      expect(deleted?.reasons.includes('quiet')).toBe(false);
    });

    it('pages one row at a time with a stable total', async () => {
      const first = await store.pageReview({
        organizationId: REVIEW_ORG,
        today: REVIEW_TODAY,
        timeZone: REVIEW_TIME_ZONE,
        fetchLimit: 1,
      });
      expect(first.isOk()).toBe(true);
      const firstPage = first._unsafeUnwrap();
      expect(firstPage.total).toBe(6);
      expect(firstPage.rows).toHaveLength(1);
      const firstId = firstPage.rows[0]?.project.id;
      expect(firstId).toBe(REVIEW_PROJECT.needsNext);

      const second = await store.pageReview({
        organizationId: REVIEW_ORG,
        today: REVIEW_TODAY,
        timeZone: REVIEW_TIME_ZONE,
        fetchLimit: 1,
        seek: reviewCursor.of(firstPage.rows[0]!),
      });
      expect(second.isOk()).toBe(true);
      const secondPage = second._unsafeUnwrap();
      expect(secondPage.total).toBe(firstPage.total);
      expect(secondPage.rows[0]?.project.id).not.toBe(firstId);

      const rest = await store.pageReview({
        organizationId: REVIEW_ORG,
        today: REVIEW_TODAY,
        timeZone: REVIEW_TIME_ZONE,
        fetchLimit: 20,
        seek: reviewCursor.of(secondPage.rows[0]!),
      });
      expect(rest.isOk()).toBe(true);
      const restPage = rest._unsafeUnwrap();
      expect(restPage.total).toBe(firstPage.total);
      const ids = [
        ...firstPage.rows.map((row) => row.project.id),
        ...secondPage.rows.map((row) => row.project.id),
        ...restPage.rows.map((row) => row.project.id),
      ];
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(firstPage.total);
    });

    it('returns reason counts for the full set', async () => {
      const counts = await store.countReview({
        organizationId: REVIEW_ORG,
        today: REVIEW_TODAY,
        timeZone: REVIEW_TIME_ZONE,
      });
      expect(counts.isOk()).toBe(true);
      if (!counts.isOk()) {
        return;
      }
      expect(counts.value.noNextAction).toBe(3);
      expect(counts.value.quiet).toBe(1);
      expect(counts.value.waiting).toBe(4);
    });
  });
};
