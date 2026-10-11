import { describe, expect, it } from 'vitest';
import { showsNoNextActionWarning } from './project-next-action';

describe('showsNoNextActionWarning', () => {
  it('warns on active and waiting with no next action', () => {
    expect(showsNoNextActionWarning({ status: 'active', nextActionTaskId: null })).toBe(true);
    expect(showsNoNextActionWarning({ status: 'waiting', nextActionTaskId: null })).toBe(true);
  });

  it('does not warn when a next action is set', () => {
    expect(
      showsNoNextActionWarning({
        status: 'active',
        nextActionTaskId: '00000000-0000-0000-0000-000000000001',
      })
    ).toBe(false);
    expect(
      showsNoNextActionWarning({
        status: 'someday',
        nextActionTaskId: '00000000-0000-0000-0000-000000000001',
      })
    ).toBe(false);
  });

  it('never warns on someday or done', () => {
    expect(showsNoNextActionWarning({ status: 'someday', nextActionTaskId: null })).toBe(false);
    expect(showsNoNextActionWarning({ status: 'done', nextActionTaskId: null })).toBe(false);
  });
});
