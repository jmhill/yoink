import { describe, expect, it } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import type { Project, Task } from '@yoink/api-contracts';
import { PILE_SAFETY_CAP } from '@yoink/api-contracts';
import { encodeKeysetCursor } from '../../listing/application/keyset-codec.js';
import { doneListCursor } from '../../listing/domain/list-keys.js';
import { asFinishedTaskOrNull, type DoneListRow } from '../domain/group-done.js';
import { storageError } from '../domain/review-errors.js';
import { handleListDone } from './handle-list-done.js';

const ORG = '550e8400-e29b-41d4-a716-446655440001';
const USER = '550e8400-e29b-41d4-a716-446655440002';
const NOW = new Date('2026-10-12T17:00:00.000Z');

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

const house = project({ id: '550e8400-e29b-41d4-a716-446655440010', name: 'House storage' });

const finished = (overrides: Partial<Task> & Pick<Task, 'id' | 'title' | 'completedAt'>): Task => ({
  organizationId: ORG,
  createdById: USER,
  createdAt: '2026-10-11T13:00:00.000Z',
  lastChangedAt: overrides.completedAt ?? null,
  lastChangedBy: USER,
  completedBy: USER,
  projectId: house.id,
  ...overrides,
});

const asRow = (task: Task): DoneListRow => {
  const parsed = asFinishedTaskOrNull(task);
  if (parsed === null) {
    throw new Error('expected finished task');
  }
  return { task: parsed, project: house, nextAction: null };
};

const attic = finished({
  id: '550e8400-e29b-41d4-a716-446655440101',
  title: 'Box the attic',
  completedAt: '2026-10-13T20:12:00.000Z',
});

describe('handleListDone', () => {
  it('defaults the week from the stored zone and pages the pile cap', async () => {
    let loads = 0;
    const result = await handleListDone(
      { organizationId: ORG },
      {
        now: () => NOW,
        loadTimeZone: () => okAsync('America/Chicago'),
        loadCompletedByNames: () => okAsync(() => 'Lane'),
        pageDoneList: (options) => {
          loads += 1;
          expect(options.organizationId).toBe(ORG);
          expect(options.completedAfter).toBe('2026-10-12T05:00:00.000Z');
          expect(options.completedBefore).toBe('2026-10-19T05:00:00.000Z');
          expect(options.fetchLimit).toBe(PILE_SAFETY_CAP + 1);
          return okAsync({
            rows: [asRow(attic)],
            total: 1,
            otherTaskCount: 2,
          });
        },
      }
    );

    expect(loads).toBe(1);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.timeZone).toBe('America/Chicago');
    expect(result.value.week).toEqual({ start: '2026-10-12', end: '2026-10-18' });
    expect(result.value.previousWeek).toBe('2026-10-05');
    expect(result.value.nextWeek).toBeNull();
    expect(result.value.groups).toHaveLength(1);
    expect(result.value.groups[0]?.tasks[0]?.completedByName).toBe('Lane');
    expect(result.value.otherTaskCount).toBe(2);
    expect(result.value.total).toBe(1);
  });

  it('rejects a Tuesday week without loading tasks', async () => {
    let loads = 0;
    const result = await handleListDone(
      { organizationId: ORG, week: '2026-10-13' },
      {
        now: () => NOW,
        loadTimeZone: () => okAsync('America/Chicago'),
        loadCompletedByNames: () => okAsync(() => 'Lane'),
        pageDoneList: () => {
          loads += 1;
          return errAsync(storageError('should not load'));
        },
      }
    );
    expect(loads).toBe(0);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_WEEK');
    }
  });

  it('rejects a future Monday without loading tasks', async () => {
    const result = await handleListDone(
      { organizationId: ORG, week: '2026-10-19' },
      {
        now: () => NOW,
        loadTimeZone: () => okAsync('America/Chicago'),
        loadCompletedByNames: () => okAsync(() => 'Lane'),
        pageDoneList: () => errAsync(storageError('should not load')),
      }
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_WEEK');
    }
  });

  it('returns InvalidCursor without loading when the cursor is malformed', async () => {
    let loads = 0;
    const result = await handleListDone(
      { organizationId: ORG, cursor: 'nope' },
      {
        now: () => NOW,
        loadTimeZone: () => okAsync('America/Chicago'),
        loadCompletedByNames: () => okAsync(() => 'Lane'),
        pageDoneList: () => {
          loads += 1;
          return errAsync(storageError('should not load'));
        },
      }
    );
    expect(loads).toBe(0);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_CURSOR');
    }
  });

  it('assembles a page cursor from the last task on the page', async () => {
    const later = finished({
      id: '550e8400-e29b-41d4-a716-446655440199',
      title: 'Later',
      completedAt: '2026-10-14T20:00:00.000Z',
    });
    const result = await handleListDone(
      { organizationId: ORG, week: '2026-10-12', limit: 1 },
      {
        now: () => NOW,
        loadTimeZone: () => okAsync('America/Chicago'),
        loadCompletedByNames: () => okAsync(() => 'Lane'),
        pageDoneList: (options) => {
          expect(options.fetchLimit).toBe(2);
          return okAsync({
            rows: [asRow(later), asRow(attic)],
            total: 2,
            otherTaskCount: 0,
          });
        },
      }
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.groups[0]?.tasks).toHaveLength(1);
    expect(result.value.hasMore).toBe(true);
    const finishedLater = asFinishedTaskOrNull(later);
    expect(finishedLater).not.toBeNull();
    if (finishedLater === null) {
      return;
    }
    expect(result.value.nextCursor).toBe(encodeKeysetCursor(doneListCursor.of(finishedLater)));
    expect(result.value.nextWeek).toBeNull();
  });
});
