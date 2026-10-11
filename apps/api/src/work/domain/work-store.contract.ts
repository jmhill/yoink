import { describe, it, expect, beforeEach } from 'vitest';
import type { NamedList, Project, Task } from '@yoink/api-contracts';
import { workDueCursor, workNextActionCursor } from '../../listing/domain/list-keys.js';
import type { WorkStore } from './work-store.js';

export const WORK_TODAY = '2025-01-15';

export const WORK_ORG = '550e8400-e29b-41d4-a716-446655440001';
export const WORK_CREATED_BY = '550e8400-e29b-41d4-a716-446655440002';
export const WORK_ALICE = '550e8400-e29b-41d4-a716-4466554400a1';
export const WORK_BOB = '550e8400-e29b-41d4-a716-4466554400a2';
export const WORK_BOT = '550e8400-e29b-41d4-a716-4466554400a3';

export const WORK_LIST_CHORES = '550e8400-e29b-41d4-a716-446655440301';
export const WORK_LIST_WEEKEND = '550e8400-e29b-41d4-a716-446655440302';
export const WORK_LIST_EMPTY = '550e8400-e29b-41d4-a716-446655440303';

export const WORK_PROJECT = {
  alpha: '550e8400-e29b-41d4-a716-446655440010',
  bravo: '550e8400-e29b-41d4-a716-446655440011',
  charlie: '550e8400-e29b-41d4-a716-446655440012',
  delta: '550e8400-e29b-41d4-a716-446655440013',
  echo: '550e8400-e29b-41d4-a716-446655440014',
  foxtrot: '550e8400-e29b-41d4-a716-446655440015',
  golf: '550e8400-e29b-41d4-a716-446655440016',
  hotel: '550e8400-e29b-41d4-a716-446655440017',
  india: '550e8400-e29b-41d4-a716-446655440018',
} as const;

export const WORK_TASK = {
  alphaNa: '550e8400-e29b-41d4-a716-446655440101',
  bravoNa: '550e8400-e29b-41d4-a716-446655440102',
  charlieNa: '550e8400-e29b-41d4-a716-446655440103',
  deltaNa: '550e8400-e29b-41d4-a716-446655440104',
  echoNa: '550e8400-e29b-41d4-a716-446655440105',
  foxtrotNa: '550e8400-e29b-41d4-a716-446655440106',
  hotelCompleted: '550e8400-e29b-41d4-a716-446655440107',
  indiaNa: '550e8400-e29b-41d4-a716-446655440108',
  aliceLoose: '550e8400-e29b-41d4-a716-446655440201',
  futureLoose: '550e8400-e29b-41d4-a716-446655440202',
  undatedLoose: '550e8400-e29b-41d4-a716-446655440203',
  inProject: '550e8400-e29b-41d4-a716-446655440204',
  completedLoose: '550e8400-e29b-41d4-a716-446655440205',
  deletedLoose: '550e8400-e29b-41d4-a716-446655440206',
} as const;

const lastChanged = {
  lastChangedAt: null,
  lastChangedBy: null,
  completedBy: null,
} as const;

export const workTask = (overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
  organizationId: WORK_ORG,
  createdById: WORK_CREATED_BY,
  createdAt: '2025-01-15T10:00:00.000Z',
  ...lastChanged,
  ...overrides,
});

export const workProject = (
  overrides: Partial<Project> & Pick<Project, 'id' | 'name'>
): Project => ({
  organizationId: WORK_ORG,
  createdById: WORK_CREATED_BY,
  status: 'active',
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: null,
  notebookPages: [],
  createdAt: '2025-01-15T10:00:00.000Z',
  lastChangedAt: null,
  lastChangedBy: null,
  ...overrides,
});

export const workList = (
  overrides: Partial<NamedList> & Pick<NamedList, 'id' | 'name'>
): NamedList => ({
  organizationId: WORK_ORG,
  createdById: WORK_CREATED_BY,
  createdAt: '2025-01-15T10:00:00.000Z',
  ...overrides,
});

export const workFixtureLists = (): NamedList[] => [
  workList({
    id: WORK_LIST_CHORES,
    name: 'Chores',
    createdAt: '2025-01-15T09:00:00.000Z',
  }),
  workList({
    id: WORK_LIST_EMPTY,
    name: 'Empty',
    createdAt: '2025-01-15T09:30:00.000Z',
  }),
  workList({
    id: WORK_LIST_WEEKEND,
    name: 'Weekend',
    createdAt: '2025-01-15T10:00:00.000Z',
  }),
];

export const workFixtureTasks = (): Task[] => [
  workTask({
    id: WORK_TASK.alphaNa,
    title: 'Alpha next',
    dueDate: '2025-01-13',
    assigneeId: WORK_ALICE,
    projectId: WORK_PROJECT.alpha,
    listId: WORK_LIST_CHORES,
  }),
  workTask({
    id: WORK_TASK.bravoNa,
    title: 'Bravo next',
    dueDate: '2025-01-20',
    assigneeId: WORK_BOB,
    projectId: WORK_PROJECT.bravo,
    listId: WORK_LIST_WEEKEND,
  }),
  workTask({
    id: WORK_TASK.charlieNa,
    title: 'Charlie next',
    dueDate: '2025-01-20',
    projectId: WORK_PROJECT.charlie,
  }),
  workTask({
    id: WORK_TASK.deltaNa,
    title: 'Delta next',
    assigneeId: WORK_BOT,
    projectId: WORK_PROJECT.delta,
  }),
  workTask({
    id: WORK_TASK.echoNa,
    title: 'Echo waiting next',
    dueDate: '2025-01-14',
    assigneeId: WORK_BOB,
    projectId: WORK_PROJECT.echo,
    createdAt: '2025-01-14T09:00:00.000Z',
  }),
  workTask({
    id: WORK_TASK.foxtrotNa,
    title: 'Foxtrot someday next',
    projectId: WORK_PROJECT.foxtrot,
  }),
  workTask({
    id: WORK_TASK.hotelCompleted,
    title: 'Hotel completed pointer',
    dueDate: '2025-01-14',
    completedAt: '2025-01-15T09:00:00.000Z',
    projectId: WORK_PROJECT.hotel,
  }),
  workTask({
    id: WORK_TASK.indiaNa,
    title: 'India done next',
    projectId: WORK_PROJECT.india,
  }),
  workTask({
    id: WORK_TASK.aliceLoose,
    title: 'Alice loose overdue',
    dueDate: '2025-01-11',
    assigneeId: WORK_ALICE,
    listId: WORK_LIST_CHORES,
    createdAt: '2025-01-11T10:00:00.000Z',
  }),
  workTask({
    id: WORK_TASK.futureLoose,
    title: 'Future loose',
    dueDate: '2025-01-25',
    listId: WORK_LIST_WEEKEND,
  }),
  workTask({
    id: WORK_TASK.undatedLoose,
    title: 'Undated loose',
  }),
  workTask({
    id: WORK_TASK.inProject,
    title: 'Golf due leftover',
    dueDate: '2025-01-14',
    projectId: WORK_PROJECT.golf,
    listId: WORK_LIST_CHORES,
    createdAt: '2025-01-14T10:00:00.000Z',
  }),
  workTask({
    id: WORK_TASK.completedLoose,
    title: 'Completed loose',
    dueDate: '2025-01-14',
    completedAt: '2025-01-15T08:00:00.000Z',
    listId: WORK_LIST_CHORES,
  }),
  workTask({
    id: WORK_TASK.deletedLoose,
    title: 'Deleted loose',
    dueDate: '2025-01-14',
    listId: WORK_LIST_WEEKEND,
  }),
];

export const workFixtureProjects = (): Project[] => [
  workProject({
    id: WORK_PROJECT.alpha,
    name: 'Alpha',
    nextActionTaskId: WORK_TASK.alphaNa,
  }),
  workProject({
    id: WORK_PROJECT.bravo,
    name: 'Bravo',
    nextActionTaskId: WORK_TASK.bravoNa,
  }),
  workProject({
    id: WORK_PROJECT.charlie,
    name: 'Charlie',
    nextActionTaskId: WORK_TASK.charlieNa,
  }),
  workProject({
    id: WORK_PROJECT.delta,
    name: 'Delta',
    nextActionTaskId: WORK_TASK.deltaNa,
  }),
  workProject({
    id: WORK_PROJECT.echo,
    name: 'Echo',
    status: 'waiting',
    waitingOn: 'Mike',
    nextActionTaskId: WORK_TASK.echoNa,
  }),
  workProject({
    id: WORK_PROJECT.foxtrot,
    name: 'Foxtrot',
    status: 'someday',
    nextActionTaskId: WORK_TASK.foxtrotNa,
  }),
  workProject({
    id: WORK_PROJECT.golf,
    name: 'Golf',
  }),
  workProject({
    id: WORK_PROJECT.hotel,
    name: 'Hotel',
    nextActionTaskId: WORK_TASK.hotelCompleted,
  }),
  workProject({
    id: WORK_PROJECT.india,
    name: 'India',
    status: 'done',
    nextActionTaskId: WORK_TASK.indiaNa,
  }),
];

export type WorkStoreHarness = {
  store: WorkStore;
};

export const runWorkStoreContractTests = (options: {
  createHarness: () => WorkStoreHarness | Promise<WorkStoreHarness>;
  beforeEach?: () => void | Promise<void>;
}) => {
  let store: WorkStore;

  beforeEach(async () => {
    if (options.beforeEach) {
      await options.beforeEach();
    }
    const harness = await options.createHarness();
    store = harness.store;
  });

  describe('WorkStore contract', () => {
    it('lists next actions for everyone in dated-then-name order', async () => {
      const result = await store.pageNextActions({
        organizationId: WORK_ORG,
        owner: 'all',
        callerId: WORK_ALICE,
        fetchLimit: 20,
      });
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(result.value.total).toBe(4);
      expect(result.value.rows.map((row) => row.task.id)).toEqual([
        WORK_TASK.alphaNa,
        WORK_TASK.bravoNa,
        WORK_TASK.charlieNa,
        WORK_TASK.deltaNa,
      ]);
      expect(result.value.rows.map((row) => row.project.name)).toEqual([
        'Alpha',
        'Bravo',
        'Charlie',
        'Delta',
      ]);
    });

    it('lists only the caller next actions when owner is me', async () => {
      const alice = await store.pageNextActions({
        organizationId: WORK_ORG,
        owner: 'me',
        callerId: WORK_ALICE,
        fetchLimit: 20,
      });
      expect(alice.isOk()).toBe(true);
      if (alice.isOk()) {
        expect(alice.value.rows.map((row) => row.task.id)).toEqual([WORK_TASK.alphaNa]);
        expect(alice.value.total).toBe(1);
      }

      const bot = await store.pageNextActions({
        organizationId: WORK_ORG,
        owner: 'me',
        callerId: WORK_BOT,
        fetchLimit: 20,
      });
      expect(bot.isOk()).toBe(true);
      if (bot.isOk()) {
        expect(bot.value.rows.map((row) => row.task.id)).toEqual([WORK_TASK.deltaNa]);
      }
    });

    it('lists due tasks that are today-or-earlier and not already a shown next action', async () => {
      const all = await store.pageDue({
        organizationId: WORK_ORG,
        owner: 'all',
        callerId: WORK_ALICE,
        today: WORK_TODAY,
        fetchLimit: 20,
      });
      expect(all.isOk()).toBe(true);
      if (all.isOk()) {
        expect(all.value.rows.map((task) => task.id)).toEqual([
          WORK_TASK.aliceLoose,
          WORK_TASK.echoNa,
          WORK_TASK.inProject,
        ]);
        expect(all.value.total).toBe(3);
      }

      const mine = await store.pageDue({
        organizationId: WORK_ORG,
        owner: 'me',
        callerId: WORK_ALICE,
        today: WORK_TODAY,
        fetchLimit: 20,
      });
      expect(mine.isOk()).toBe(true);
      if (mine.isOk()) {
        expect(mine.value.rows.map((task) => task.id)).toEqual([WORK_TASK.aliceLoose]);
      }
    });

    it('pages next actions one row at a time with a stable total', async () => {
      const first = await store.pageNextActions({
        organizationId: WORK_ORG,
        owner: 'all',
        callerId: WORK_ALICE,
        fetchLimit: 1,
      });
      expect(first.isOk()).toBe(true);
      if (!first.isOk() || !first.value.rows[0]) {
        return;
      }
      expect(first.value.total).toBe(4);
      expect(first.value.rows.map((row) => row.task.id)).toEqual([WORK_TASK.alphaNa]);

      const second = await store.pageNextActions({
        organizationId: WORK_ORG,
        owner: 'all',
        callerId: WORK_ALICE,
        fetchLimit: 1,
        seek: workNextActionCursor.of(first.value.rows[0]),
      });
      expect(second.isOk()).toBe(true);
      if (!second.isOk() || !second.value.rows[0]) {
        return;
      }
      expect(second.value.total).toBe(4);
      expect(second.value.rows.map((row) => row.task.id)).toEqual([WORK_TASK.bravoNa]);

      const rest = await store.pageNextActions({
        organizationId: WORK_ORG,
        owner: 'all',
        callerId: WORK_ALICE,
        fetchLimit: 10,
        seek: workNextActionCursor.of(second.value.rows[0]),
      });
      expect(rest.isOk()).toBe(true);
      if (rest.isOk()) {
        expect(rest.value.rows.map((row) => row.task.id)).toEqual([
          WORK_TASK.charlieNa,
          WORK_TASK.deltaNa,
        ]);
        expect(rest.value.total).toBe(4);
      }
    });

    it('lists named lists with open counts that ignore Mine and include project tasks', async () => {
      const result = await store.pageLists({
        organizationId: WORK_ORG,
        fetchLimit: 20,
      });
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(result.value.lists.rows.map((list) => [list.id, list.name, list.openTaskCount])).toEqual(
        [
          [WORK_LIST_CHORES, 'Chores', 3],
          [WORK_LIST_EMPTY, 'Empty', 0],
          [WORK_LIST_WEEKEND, 'Weekend', 2],
        ]
      );
      expect(result.value.unlistedOpenCount).toBe(6);
      expect(result.value.lists.total).toBe(3);
    });
  });
};

export const workDueCursorOf = workDueCursor.of;
export const workNextActionCursorOf = workNextActionCursor.of;
