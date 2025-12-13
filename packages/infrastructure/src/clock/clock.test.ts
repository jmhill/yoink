import { describe, it, expect } from 'vitest';
import { createSystemClock } from './system-clock.js';
import { createFakeClock } from './fake-clock.js';

describe('createSystemClock', () => {
  it('returns current time', () => {
    const clock = createSystemClock();
    const before = new Date();
    const result = clock.now();
    const after = new Date();

    expect(result.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe('createFakeClock', () => {
  it('returns fixed time', () => {
    const fixedTime = new Date('2025-01-15T10:00:00Z');
    const clock = createFakeClock(fixedTime);

    expect(clock.now()).toEqual(fixedTime);
  });

  it('returns new Date instance each call', () => {
    const fixedTime = new Date('2025-01-15T10:00:00Z');
    const clock = createFakeClock(fixedTime);

    const first = clock.now();
    const second = clock.now();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it('can advance time by milliseconds', () => {
    const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));

    clock.advanceBy(5000);

    expect(clock.now()).toEqual(new Date('2025-01-15T10:00:05.000Z'));
  });

  it('can set to a new time', () => {
    const clock = createFakeClock(new Date('2025-01-15T10:00:00Z'));
    const newTime = new Date('2025-06-01T15:30:00Z');

    clock.setTime(newTime);

    expect(clock.now()).toEqual(newTime);
  });

  it('auto-advances time when configured', () => {
    const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'), {
      autoAdvanceMs: 1000,
    });

    expect(clock.now()).toEqual(new Date('2025-01-15T10:00:00.000Z'));
    expect(clock.now()).toEqual(new Date('2025-01-15T10:00:01.000Z'));
    expect(clock.now()).toEqual(new Date('2025-01-15T10:00:02.000Z'));
  });
});
