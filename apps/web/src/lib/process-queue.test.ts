import { describe, expect, it } from 'vitest';
import { processQueueSubcopy, sortProcessQueue } from './process-queue';

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

describe('processQueueSubcopy', () => {
  it('reads N to process', () => {
    expect(processQueueSubcopy(0)).toBe('0 to process');
    expect(processQueueSubcopy(3)).toBe('3 to process');
  });
});
