import { describe, expect, it } from 'vitest';
import type { DoneListPage } from '@yoink/api-contracts';
import {
  canSetDoneNextAction,
  doneOtherLine,
  doneVersionOf,
  formatDoneTaskWhen,
  formatDoneWeekRange,
  showsDoneProjectChip,
} from './done-list';

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

describe('formatDoneWeekRange', () => {
  it('formats a same-month week as Oct 12 – 18', () => {
    expect(formatDoneWeekRange('2026-10-12', '2026-10-18')).toBe('Oct 12 – 18');
  });

  it('keeps both months when the week crosses them', () => {
    expect(formatDoneWeekRange('2026-09-28', '2026-10-04')).toBe('Sep 28 – Oct 4');
  });
});

describe('formatDoneTaskWhen', () => {
  it('formats weekday, compact time, and who', () => {
    expect(formatDoneTaskWhen('2026-10-12T20:12:00.000Z', 'America/Chicago', 'Lane')).toBe(
      'Mon 3:12pm · Lane'
    );
  });

  it('omits who when unknown', () => {
    expect(formatDoneTaskWhen('2026-10-12T20:12:00.000Z', 'America/Chicago')).toBe('Mon 3:12pm');
  });
});

describe('doneOtherLine', () => {
  it('singularizes one task', () => {
    expect(doneOtherLine(1)).toBe('Plus 1 task not in a project');
    expect(doneOtherLine(21)).toBe('Plus 21 tasks not in a project');
  });
});

describe('done group flags', () => {
  it('offers Set next action only on active/waiting with none', () => {
    expect(
      canSetDoneNextAction({
        project,
        nextAction: null,
        tasks: [],
      })
    ).toBe(true);
    expect(
      canSetDoneNextAction({
        project: { ...project, status: 'done' },
        nextAction: null,
        tasks: [],
      })
    ).toBe(false);
    expect(showsDoneProjectChip({ project: { ...project, status: 'done' }, nextAction: null, tasks: [] })).toBe(
      true
    );
  });
});

describe('doneVersionOf', () => {
  it('changes when a next action appears', () => {
    const page: DoneListPage = {
      hasMore: false,
      nextCursor: null,
      total: 0,
      timeZone: 'America/Chicago',
      week: { start: '2026-10-12', end: '2026-10-18' },
      previousWeek: '2026-10-05',
      nextWeek: null,
      groups: [{ project, nextAction: null, tasks: [] }],
      otherTaskCount: 0,
    };
    const before = doneVersionOf(page);
    const after = doneVersionOf({
      ...page,
      groups: [
        {
          project,
          nextAction: { id: '550e8400-e29b-41d4-a716-446655440201', title: 'Box the attic' },
          tasks: [],
        },
      ],
    });
    expect(before).not.toBe(after);
  });
});
