import { describe, expect, it } from 'vitest';
import {
  processEmptySnoozedCopy,
  processQueue,
  processQueueSubcopy,
  sortProcessQueue,
} from './process-queue';

describe('sortProcessQueue', () => {
  it('orders captures oldest first', () => {
    const newer = { id: 'n', capturedAt: '2026-10-09T12:00:00.000Z', content: 'new' };
    const older = { id: 'o', capturedAt: '2026-09-13T08:00:00.000Z', content: 'old' };

    expect(sortProcessQueue([newer, older]).map((item) => item.id)).toEqual(['o', 'n']);
  });

  it('breaks a capturedAt tie on id so the order is stable', () => {
    const laterId = { id: 'b', capturedAt: '2026-10-01T00:00:00.000Z' };
    const earlierId = { id: 'a', capturedAt: '2026-10-01T00:00:00.000Z' };

    expect(sortProcessQueue([laterId, earlierId]).map((item) => item.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('processQueue', () => {
  it('picks the oldest capture and counts it in left', () => {
    const newer = { id: 'n', capturedAt: '2026-10-09T12:00:00.000Z' };
    const older = { id: 'o', capturedAt: '2026-09-13T08:00:00.000Z' };
    const queue = processQueue([newer, older]);

    expect(queue.current).toEqual({ kind: 'capture', capture: older });
    expect(queue.left).toBe(2);
  });

  it('is empty when there is nothing to process', () => {
    expect(processQueue([])).toEqual({ current: null, left: 0 });
  });
});

describe('processQueueSubcopy', () => {
  it('reads N left, including the current capture', () => {
    expect(processQueueSubcopy(0)).toBe('0 left');
    expect(processQueueSubcopy(3)).toBe('3 left');
  });
});

describe('processEmptySnoozedCopy', () => {
  it('names how many snoozed will come back', () => {
    expect(processEmptySnoozedCopy(0)).toBeNull();
    expect(processEmptySnoozedCopy(1)).toBe('1 snoozed will come back');
    expect(processEmptySnoozedCopy(4)).toBe('4 snoozed will come back');
  });
});
