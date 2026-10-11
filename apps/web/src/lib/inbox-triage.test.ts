import { describe, expect, it } from 'vitest';
import {
  inboxQueryWithoutCapture,
  promoteTaskData,
  snoozeUntil,
} from './inbox-triage';

describe('snoozeUntil', () => {
  it('later-today before 4pm lands at 6pm the same day', () => {
    const now = new Date(2026, 9, 11, 10, 15, 0, 0);
    expect(snoozeUntil('later-today', now)).toBe(
      new Date(2026, 9, 11, 18, 0, 0, 0).toISOString()
    );
  });

  it('later-today at or after 4pm is two hours from now', () => {
    const atFour = new Date(2026, 9, 11, 16, 0, 0, 0);
    expect(snoozeUntil('later-today', atFour)).toBe(
      new Date(2026, 9, 11, 18, 0, 0, 0).toISOString()
    );
    const afterFour = new Date(2026, 9, 11, 17, 20, 30, 0);
    expect(snoozeUntil('later-today', afterFour)).toBe(
      new Date(2026, 9, 11, 19, 20, 30, 0).toISOString()
    );
  });

  it('tomorrow is 9am the next calendar day', () => {
    const now = new Date(2026, 9, 7, 22, 45, 0, 0);
    expect(snoozeUntil('tomorrow', now)).toBe(
      new Date(2026, 9, 8, 9, 0, 0, 0).toISOString()
    );
  });

  it('next-week from Sunday is 9am the following Monday', () => {
    const sunday = new Date(2026, 9, 11, 20, 0, 0, 0);
    expect(sunday.getDay()).toBe(0);
    expect(snoozeUntil('next-week', sunday)).toBe(
      new Date(2026, 9, 12, 9, 0, 0, 0).toISOString()
    );
  });

  it('next-week from a weekday is 9am the coming Monday', () => {
    const wednesday = new Date(2026, 9, 7, 14, 0, 0, 0);
    expect(snoozeUntil('next-week', wednesday)).toBe(
      new Date(2026, 9, 12, 9, 0, 0, 0).toISOString()
    );
  });
});

describe('promoteTaskData', () => {
  it('keeps title when every optional field is missing', () => {
    expect(promoteTaskData({ title: 'Clip' })).toEqual({ title: 'Clip' });
  });

  it('includes dueDate only when it is present', () => {
    expect(promoteTaskData({ title: 'Clip', dueDate: '2026-10-12' })).toEqual({
      title: 'Clip',
      dueDate: '2026-10-12',
    });
    expect(promoteTaskData({ title: 'Clip', dueDate: '' })).toEqual({ title: 'Clip' });
  });

  it('includes listId only when it is present', () => {
    expect(
      promoteTaskData({ title: 'Clip', listId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
    ).toEqual({
      title: 'Clip',
      listId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });
    expect(promoteTaskData({ title: 'Clip', listId: '' })).toEqual({ title: 'Clip' });
  });

  it('includes projectId only when it is present', () => {
    expect(
      promoteTaskData({
        title: 'Clip',
        projectId: '11111111-2222-3333-4444-555555555555',
      })
    ).toEqual({
      title: 'Clip',
      projectId: '11111111-2222-3333-4444-555555555555',
    });
    expect(promoteTaskData({ title: 'Clip', projectId: '' })).toEqual({ title: 'Clip' });
  });

  it('includes every optional field when all are set', () => {
    expect(
      promoteTaskData({
        title: 'Clip',
        dueDate: '2026-10-12',
        listId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        projectId: '11111111-2222-3333-4444-555555555555',
      })
    ).toEqual({
      title: 'Clip',
      dueDate: '2026-10-12',
      listId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      projectId: '11111111-2222-3333-4444-555555555555',
    });
  });
});

describe('inboxQueryWithoutCapture', () => {
  it('drops the capture and decrements total without mutating the input', () => {
    const inbox = {
      status: 200 as const,
      body: {
        captures: [{ id: 'keep' }, { id: 'gone' }],
        total: 2,
        extra: true,
      },
    };

    expect(inboxQueryWithoutCapture(inbox, 'gone')).toEqual({
      status: 200,
      body: {
        captures: [{ id: 'keep' }],
        total: 1,
        extra: true,
      },
    });
    expect(inbox.body.captures).toHaveLength(2);
    expect(inbox.body.total).toBe(2);
  });
});
