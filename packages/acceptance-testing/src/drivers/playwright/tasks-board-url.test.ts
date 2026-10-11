import { describe, expect, it } from 'vitest';
import {
  isMobileTabLandingUrl,
  isSettledTasksBoardUrl,
  isWorkTabLandingUrl,
  tasksBoardCopyForUrl,
} from './tasks-board-url.js';

describe('isSettledTasksBoardUrl', () => {
  it('accepts a smart filter with no leftover pile', () => {
    expect(isSettledTasksBoardUrl('http://localhost/tasks?filter=today')).toBe(true);
    expect(isSettledTasksBoardUrl('http://localhost/tasks?filter=upcoming')).toBe(true);
  });

  it('accepts a named-list or Unlisted pile with no leftover filter', () => {
    expect(
      isSettledTasksBoardUrl('http://localhost/tasks?pile=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    ).toBe(true);
    expect(isSettledTasksBoardUrl('http://localhost/tasks?pile=unlisted')).toBe(true);
  });

  it('rejects empty /tasks and a filter+pile pair still being redirected', () => {
    expect(isSettledTasksBoardUrl('http://localhost/tasks')).toBe(false);
    expect(
      isSettledTasksBoardUrl(
        'http://localhost/tasks?filter=today&pile=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      )
    ).toBe(false);
    expect(isSettledTasksBoardUrl('http://localhost/')).toBe(false);
  });
});

describe('tasksBoardCopyForUrl', () => {
  it('maps each settled smart view to its heading and empty card', () => {
    expect(tasksBoardCopyForUrl('http://localhost/tasks?filter=today')).toEqual({
      heading: 'Today',
      empty: 'No tasks for today',
    });
    expect(tasksBoardCopyForUrl('http://localhost/tasks?filter=upcoming')).toEqual({
      heading: 'Upcoming',
      empty: 'No upcoming tasks',
    });
    expect(tasksBoardCopyForUrl('http://localhost/tasks?filter=mine')).toEqual({
      heading: 'My tasks',
      empty: 'No tasks assigned to you',
    });
    expect(tasksBoardCopyForUrl('http://localhost/tasks?filter=completed')).toEqual({
      heading: 'Done',
      empty: 'No completed tasks',
    });
  });

  it('maps Unlisted and a named pile; named heading is not in the URL', () => {
    expect(tasksBoardCopyForUrl('http://localhost/tasks?pile=unlisted')).toEqual({
      heading: 'Unlisted',
      empty: 'No open unlisted tasks',
    });
    expect(
      tasksBoardCopyForUrl('http://localhost/tasks?pile=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    ).toEqual({
      heading: null,
      empty: 'No open tasks on this list',
    });
  });

  it('is null while the board is still redirecting', () => {
    expect(tasksBoardCopyForUrl('http://localhost/tasks')).toBeNull();
    expect(
      tasksBoardCopyForUrl(
        'http://localhost/tasks?filter=mine&pile=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      )
    ).toBeNull();
    expect(tasksBoardCopyForUrl('http://localhost/')).toBeNull();
  });
});

describe('isWorkTabLandingUrl', () => {
  it('is /work — the Work tab landing (Now)', () => {
    expect(isWorkTabLandingUrl('http://localhost/work')).toBe(true);
    expect(isWorkTabLandingUrl('http://localhost/work?mine=true')).toBe(true);
    expect(isWorkTabLandingUrl('http://localhost/tasks?filter=today')).toBe(false);
    expect(isWorkTabLandingUrl('http://localhost/tasks?filter=upcoming')).toBe(false);
    expect(
      isWorkTabLandingUrl('http://localhost/tasks?pile=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    ).toBe(false);
    expect(isWorkTabLandingUrl('http://localhost/tasks')).toBe(false);
  });
});

describe('isMobileTabLandingUrl', () => {
  it('waits on each tab’s own landing path', () => {
    expect(isMobileTabLandingUrl('capture', 'http://localhost/')).toBe(true);
    expect(isMobileTabLandingUrl('capture', 'http://localhost/snoozed')).toBe(true);
    expect(isMobileTabLandingUrl('process', 'http://localhost/process')).toBe(true);
    expect(isMobileTabLandingUrl('work', 'http://localhost/work')).toBe(true);
    expect(isMobileTabLandingUrl('review', 'http://localhost/projects')).toBe(true);
    expect(isMobileTabLandingUrl('review', 'http://localhost/projects/abc')).toBe(false);
  });
});
