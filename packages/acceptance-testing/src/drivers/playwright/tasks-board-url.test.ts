import { describe, expect, it } from 'vitest';
import { isSettledTasksBoardUrl, isTasksThumbLandingUrl } from './tasks-board-url.js';

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

describe('isTasksThumbLandingUrl', () => {
  it('is only Today with no pile — the Link to="/tasks" landing', () => {
    expect(isTasksThumbLandingUrl('http://localhost/tasks?filter=today')).toBe(true);
    expect(isTasksThumbLandingUrl('http://localhost/tasks?filter=upcoming')).toBe(false);
    expect(
      isTasksThumbLandingUrl('http://localhost/tasks?pile=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    ).toBe(false);
    expect(isTasksThumbLandingUrl('http://localhost/tasks')).toBe(false);
  });
});
