import { describe, expect, it } from 'vitest';
import { reviewReasons } from './classify-review.js';

describe('reviewReasons', () => {
  it('flags an active project with no next action', () => {
    expect(
      reviewReasons({ status: 'active', nextActionTaskId: null, daysSinceChange: 1 })
    ).toEqual(['noNextAction']);
  });

  it('flags an active project that is quiet from day 7', () => {
    expect(
      reviewReasons({
        status: 'active',
        nextActionTaskId: '550e8400-e29b-41d4-a716-446655440101',
        daysSinceChange: 6,
      })
    ).toEqual([]);
    expect(
      reviewReasons({
        status: 'active',
        nextActionTaskId: '550e8400-e29b-41d4-a716-446655440101',
        daysSinceChange: 7,
      })
    ).toEqual(['quiet']);
  });

  it('lists both noNextAction and quiet on an active project that matches both', () => {
    expect(
      reviewReasons({ status: 'active', nextActionTaskId: null, daysSinceChange: 9 })
    ).toEqual(['noNextAction', 'quiet']);
  });

  it('always lists waiting, and adds noNextAction when the pointer is empty', () => {
    expect(
      reviewReasons({
        status: 'waiting',
        nextActionTaskId: '550e8400-e29b-41d4-a716-446655440101',
        daysSinceChange: 20,
      })
    ).toEqual(['waiting']);
    expect(
      reviewReasons({ status: 'waiting', nextActionTaskId: null, daysSinceChange: 20 })
    ).toEqual(['noNextAction', 'waiting']);
  });

  it('never lists someday, done, or proposed', () => {
    expect(
      reviewReasons({ status: 'someday', nextActionTaskId: null, daysSinceChange: 30 })
    ).toEqual([]);
    expect(
      reviewReasons({ status: 'done', nextActionTaskId: null, daysSinceChange: 30 })
    ).toEqual([]);
    expect(
      reviewReasons({ status: 'proposed', nextActionTaskId: null, daysSinceChange: 30 })
    ).toEqual([]);
  });
});
