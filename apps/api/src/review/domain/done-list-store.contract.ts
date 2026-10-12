import { describe, it, expect, beforeEach } from 'vitest';
import type { Project, Task } from '@yoink/api-contracts';
import { doneListCursor } from '../../listing/domain/list-keys.js';
import type { ReviewStore } from './review-store.js';
import { weekUtcBounds } from './week-bounds.js';

export const DONE_ORG = '550e8400-e29b-41d4-a716-446655440001';
export const DONE_OTHER_ORG = '550e8400-e29b-41d4-a716-446655440099';
export const DONE_USER = '550e8400-e29b-41d4-a716-446655440002';
export const DONE_OTHER_USER = '550e8400-e29b-41d4-a716-446655440098';

export const DONE_PROJECT = {
  house: '550e8400-e29b-41d4-a716-446655440010',
  garden: '550e8400-e29b-41d4-a716-446655440011',
  otherOrg: '550e8400-e29b-41d4-a716-446655440017',
} as const;

export const DONE_TASK = {
  startEdge: '550e8400-e29b-41d4-a716-446655440101',
  sundayEvening: '550e8400-e29b-41d4-a716-446655440102',
  endEdge: '550e8400-e29b-41d4-a716-446655440103',
  deleted: '550e8400-e29b-41d4-a716-446655440104',
  open: '550e8400-e29b-41d4-a716-446655440105',
  otherOrg: '550e8400-e29b-41d4-a716-446655440106',
  other: '550e8400-e29b-41d4-a716-446655440107',
  gardenNewer: '550e8400-e29b-41d4-a716-446655440108',
} as const;

const lastChanged = {
  lastChangedAt: null,
  lastChangedBy: null,
  completedBy: null,
} as const;

export const doneTask = (overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
  organizationId: DONE_ORG,
  createdById: DONE_USER,
  createdAt: '2026-10-04T13:00:00.000Z',
  ...lastChanged,
  ...overrides,
});

export const doneProject = (
  overrides: Partial<Project> & Pick<Project, 'id' | 'name'>
): Project => ({
  organizationId: DONE_ORG,
  createdById: DONE_USER,
  status: 'active',
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: null,
  notebookPages: [],
  createdAt: '2026-10-04T13:00:00.000Z',
  lastChangedAt: '2026-10-04T13:00:00.000Z',
  lastChangedBy: DONE_USER,
  ...overrides,
});

const WEEK = weekUtcBounds('2026-10-05', 'America/Chicago');

export const doneFixtureProjects = (): Project[] => [
  doneProject({ id: DONE_PROJECT.house, name: 'House storage' }),
  doneProject({
    id: DONE_PROJECT.garden,
    name: 'Garden',
    nextActionTaskId: DONE_TASK.open,
  }),
  doneProject({
    id: DONE_PROJECT.otherOrg,
    name: 'Other org',
    organizationId: DONE_OTHER_ORG,
    createdById: DONE_OTHER_USER,
  }),
];

export const doneFixtureTasks = (): Task[] => [
  doneTask({
    id: DONE_TASK.startEdge,
    title: 'Monday midnight',
    projectId: DONE_PROJECT.house,
    completedAt: WEEK.start,
    completedBy: DONE_USER,
  }),
  doneTask({
    id: DONE_TASK.sundayEvening,
    title: 'Sunday evening',
    projectId: DONE_PROJECT.house,
    completedAt: '2026-10-12T04:30:00.000Z',
    completedBy: null,
  }),
  doneTask({
    id: DONE_TASK.gardenNewer,
    title: 'Plant tomatoes',
    projectId: DONE_PROJECT.garden,
    completedAt: '2026-10-10T16:00:00.000Z',
    completedBy: DONE_USER,
  }),
  doneTask({
    id: DONE_TASK.endEdge,
    title: 'Next Monday midnight',
    projectId: DONE_PROJECT.house,
    completedAt: WEEK.end,
    completedBy: DONE_USER,
  }),
  doneTask({
    id: DONE_TASK.deleted,
    title: 'Deleted finish',
    projectId: DONE_PROJECT.house,
    completedAt: '2026-10-08T16:00:00.000Z',
    completedBy: DONE_USER,
  }),
  doneTask({
    id: DONE_TASK.open,
    title: 'Still open',
    projectId: DONE_PROJECT.garden,
  }),
  doneTask({
    id: DONE_TASK.otherOrg,
    title: 'Other org finish',
    organizationId: DONE_OTHER_ORG,
    createdById: DONE_OTHER_USER,
    projectId: DONE_PROJECT.otherOrg,
    completedAt: '2026-10-08T16:00:00.000Z',
    completedBy: DONE_OTHER_USER,
  }),
  doneTask({
    id: DONE_TASK.other,
    title: 'Groceries',
    completedAt: '2026-10-10T16:30:00.000Z',
    completedBy: DONE_USER,
  }),
];

export type DoneListStoreHarness = {
  store: ReviewStore;
};

export const runDoneListStoreContractTests = (options: {
  createHarness: () => DoneListStoreHarness | Promise<DoneListStoreHarness>;
  beforeEach?: () => void | Promise<void>;
}) => {
  let store: ReviewStore;

  describe('DoneList store contract', () => {
    beforeEach(async () => {
      if (options.beforeEach) {
        await options.beforeEach();
      }
      const harness = await options.createHarness();
      store = harness.store;
    });
    it('includes the Monday start and Sunday evening and excludes the next Monday', async () => {
      const result = await store.pageDoneList({
        organizationId: DONE_ORG,
        completedAfter: WEEK.start,
        completedBefore: WEEK.end,
        fetchLimit: 20,
      });
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      const ids = result.value.rows.map((row) => row.task.id);
      expect(ids).toContain(DONE_TASK.startEdge);
      expect(ids).toContain(DONE_TASK.sundayEvening);
      expect(ids).toContain(DONE_TASK.gardenNewer);
      expect(ids).not.toContain(DONE_TASK.endEdge);
      expect(ids).not.toContain(DONE_TASK.deleted);
      expect(ids).not.toContain(DONE_TASK.open);
      expect(ids).not.toContain(DONE_TASK.otherOrg);
      expect(ids).not.toContain(DONE_TASK.other);
      expect(result.value.otherTaskCount).toBe(1);
      expect(result.value.total).toBe(3);
      expect(result.value.rows[0]?.project.name).toBe('House storage');
    });

    it('pages with a stable total and cursor', async () => {
      const first = await store.pageDoneList({
        organizationId: DONE_ORG,
        completedAfter: WEEK.start,
        completedBefore: WEEK.end,
        fetchLimit: 1,
      });
      expect(first.isOk()).toBe(true);
      const firstPage = first._unsafeUnwrap();
      expect(firstPage.total).toBe(3);
      expect(firstPage.rows).toHaveLength(1);
      expect(firstPage.otherTaskCount).toBe(1);

      const firstTask = firstPage.rows[0]?.task;
      expect(firstTask).toBeDefined();
      if (firstTask === undefined) {
        return;
      }
      const second = await store.pageDoneList({
        organizationId: DONE_ORG,
        completedAfter: WEEK.start,
        completedBefore: WEEK.end,
        fetchLimit: 2,
        seek: doneListCursor.of(firstTask),
      });
      expect(second.isOk()).toBe(true);
      const secondPage = second._unsafeUnwrap();
      expect(secondPage.total).toBe(3);
      expect(secondPage.rows).toHaveLength(2);
      expect(secondPage.rows[0]?.task.id).not.toBe(firstPage.rows[0]?.task.id);
    });
  });
};
