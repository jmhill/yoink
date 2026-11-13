import { describe, expect, it } from 'vitest';
import { eventLoopMonitorEnabled, lagWarning } from './event-loop-lag.js';

const sample = (maxMs: number, p99Ms: number) => ({
  percentile: (percentile: number) => (percentile === 99 ? p99Ms * 1e6 : 0),
  max: maxMs * 1e6,
  mean: 1e6,
});

describe('event loop lag', () => {
  it('warns when the loop was blocked', () => {
    expect(lagWarning(sample(5000, 20))).toMatchObject({ maxMs: 5000 });
    expect(lagWarning(sample(10, 4))).toBeUndefined();
  });

  it('runs in the fixture server and stays quiet inside Vitest', () => {
    expect(eventLoopMonitorEnabled({ YOINK_TEST_FIXTURES: 'true' })).toBe(true);
    expect(eventLoopMonitorEnabled({ YOINK_TEST_FIXTURES: 'true', VITEST: 'true' })).toBe(false);
    expect(eventLoopMonitorEnabled({})).toBe(false);
  });
});
