import { describe, it, expect } from 'vitest';
import {
  formatWaitingLine,
  localDateString,
  waitingDayCount,
  waitingLineParts,
} from './format-waiting-line';

describe('formatWaitingLine', () => {
  it('shows who, the date, and the day count', () => {
    expect(
      formatWaitingLine({
        waitingOn: 'Contractor',
        waitingSince: '2026-09-30',
        today: '2026-10-10',
      })
    ).toBe('Waiting on Contractor since Sep 30 (10 days)');
  });

  it('uses a singular day', () => {
    expect(
      formatWaitingLine({
        waitingOn: 'Mike',
        waitingSince: '2026-10-09',
        today: '2026-10-10',
      })
    ).toBe('Waiting on Mike since Oct 9 (1 day)');
  });

  it('shows unknown since without a day count', () => {
    expect(
      formatWaitingLine({
        waitingOn: 'Mike',
        waitingSince: null,
        today: '2026-10-10',
      })
    ).toBe('Waiting on Mike · since unknown');
  });

  it('splits known and unknown copy so the who can be bold', () => {
    expect(
      waitingLineParts({
        waitingOn: 'Contractor',
        waitingSince: '2026-09-30',
        today: '2026-10-10',
      })
    ).toEqual({
      kind: 'known',
      who: 'Contractor',
      dateLabel: 'Sep 30',
      days: 10,
    });
    expect(
      waitingLineParts({
        waitingOn: 'Mike',
        waitingSince: null,
        today: '2026-10-10',
      })
    ).toEqual({ kind: 'unknown', who: 'Mike' });
  });
});

describe('waitingDayCount', () => {
  it('is zero when since is today', () => {
    expect(waitingDayCount('2026-10-10', '2026-10-10')).toBe(0);
  });
});

describe('localDateString', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(localDateString(new Date(2026, 9, 10))).toBe('2026-10-10');
  });
});
