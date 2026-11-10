import { describe, expect, it } from 'vitest';
import type { Project } from '@yoink/api-contracts';
import { buildReviewItems, lastChangeLocalDate } from './build-review.js';

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

describe('buildReviewItems', () => {
  it('orders needs-next-action, then quiet, then waiting, and drops someday', () => {
    const items = buildReviewItems(
      [
        {
          project: project({
            id: '550e8400-e29b-41d4-a716-446655440013',
            name: 'Someday',
            status: 'someday',
          }),
          lastChangeAt: '2026-09-01T10:00:00.000Z',
          nextAction: null,
        },
        {
          project: project({
            id: '550e8400-e29b-41d4-a716-446655440012',
            name: 'Boat',
            status: 'waiting',
            waitingOn: 'Seabrook',
            waitingSince: '2026-09-25',
            nextActionTaskId: '550e8400-e29b-41d4-a716-446655440102',
          }),
          lastChangeAt: '2026-10-11T13:00:00.000Z',
          nextAction: { id: '550e8400-e29b-41d4-a716-446655440102', title: 'Invoice', dueDate: null },
        },
        {
          project: project({
            id: '550e8400-e29b-41d4-a716-446655440011',
            name: 'Quiet garden',
            nextActionTaskId: '550e8400-e29b-41d4-a716-446655440101',
          }),
          lastChangeAt: '2026-10-05T04:30:00.000Z',
          nextAction: { id: '550e8400-e29b-41d4-a716-446655440101', title: 'Water', dueDate: null },
        },
        {
          project: project({
            id: '550e8400-e29b-41d4-a716-446655440010',
            name: 'House storage',
          }),
          lastChangeAt: '2026-10-11T13:00:00.000Z',
          nextAction: null,
        },
      ],
      { today: '2026-10-12', timeZone: 'America/Chicago' }
    );

    expect(items.map((item) => item.project.name)).toEqual([
      'House storage',
      'Quiet garden',
      'Boat',
    ]);
    expect(items[0]?.reasons).toEqual(['noNextAction']);
    expect(items[1]?.reasons).toEqual(['quiet']);
    expect(items[1]?.daysSinceChange).toBe(8);
    expect(items[2]?.daysWaiting).toBe(17);
  });

  it('counts a 11:30pm CT change as that CT day, not the UTC day', () => {
    expect(
      lastChangeLocalDate({
        lastChangeAt: '2026-10-05T04:30:00.000Z',
        timeZone: 'America/Chicago',
      })
    ).toBe('2026-10-04');
  });
});
