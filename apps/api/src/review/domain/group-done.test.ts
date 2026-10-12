import { describe, expect, it } from 'vitest';
import type { Project, Task } from '@yoink/api-contracts';
import { asFinishedTaskOrNull, groupDoneRows, type DoneListRow } from './group-done.js';

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

const task = (
  overrides: Partial<Task> & Pick<Task, 'id' | 'title' | 'completedAt'>
): Task => ({
  organizationId: ORG,
  createdById: USER,
  createdAt: '2026-10-11T13:00:00.000Z',
  lastChangedAt: overrides.completedAt ?? null,
  lastChangedBy: USER,
  completedBy: USER,
  ...overrides,
});

const house = project({ id: '550e8400-e29b-41d4-a716-446655440010', name: 'House storage' });
const garden = project({
  id: '550e8400-e29b-41d4-a716-446655440011',
  name: 'Garden',
  nextActionTaskId: '550e8400-e29b-41d4-a716-446655440201',
});

const newerGarden = task({
  id: '550e8400-e29b-41d4-a716-446655440101',
  title: 'Plant tomatoes',
  completedAt: '2026-10-13T15:00:00.000Z',
  projectId: garden.id,
  completedBy: USER,
  completedByName: 'Lane',
});
const olderHouse = task({
  id: '550e8400-e29b-41d4-a716-446655440102',
  title: 'Box the attic',
  completedAt: '2026-10-12T20:12:00.000Z',
  projectId: house.id,
  completedBy: null,
});
const olderGarden = task({
  id: '550e8400-e29b-41d4-a716-446655440103',
  title: 'Weed the bed',
  completedAt: '2026-10-12T18:00:00.000Z',
  projectId: garden.id,
  completedBy: USER,
});

const row = (item: Task, owner: Project, nextAction: DoneListRow['nextAction']): DoneListRow => {
  const finished = asFinishedTaskOrNull(item);
  if (finished === null) {
    throw new Error('expected finished task');
  }
  return { task: finished, project: owner, nextAction };
};

describe('groupDoneRows', () => {
  it('orders groups by most recent finish and tasks newest first', () => {
    const groups = groupDoneRows([
      row(newerGarden, garden, { id: '550e8400-e29b-41d4-a716-446655440201', title: 'Water plants' }),
      row(olderHouse, house, null),
      row(olderGarden, garden, { id: '550e8400-e29b-41d4-a716-446655440201', title: 'Water plants' }),
    ]);

    expect(groups.map((group) => group.project.name)).toEqual(['Garden', 'House storage']);
    expect(groups[0]?.tasks.map((item) => item.title)).toEqual(['Plant tomatoes', 'Weed the bed']);
    expect(groups[0]?.nextAction).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440201',
      title: 'Water plants',
    });
    expect(groups[1]?.nextAction).toBeNull();
  });

  it('keeps a null completedBy off the row name', () => {
    const groups = groupDoneRows([row(olderHouse, house, null)]);
    expect(groups[0]?.tasks[0]?.completedBy).toBeNull();
    expect(groups[0]?.tasks[0]?.completedByName).toBeUndefined();
  });
});

describe('asFinishedTaskOrNull', () => {
  it('returns null when completedAt is missing', () => {
    expect(
      asFinishedTaskOrNull(
        task({
          id: '550e8400-e29b-41d4-a716-446655440199',
          title: 'Open',
          completedAt: undefined,
        })
      )
    ).toBeNull();
  });
});
