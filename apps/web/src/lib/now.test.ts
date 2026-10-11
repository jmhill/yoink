import { describe, expect, it } from 'vitest';
import { listsRowLabel, localDateLabel, nowSubcopy, ownerLabelFor } from './now';

describe('nowSubcopy', () => {
  it('singularizes one next action and one due', () => {
    expect(
      nowSubcopy({ localDate: 'Sun Oct 11', nextActionCount: 1, dueCount: 1 })
    ).toBe('Sun Oct 11 · 1 next action · 1 due');
  });

  it('uses the plural and keeps zeros', () => {
    expect(
      nowSubcopy({ localDate: 'Sun Oct 11', nextActionCount: 0, dueCount: 0 })
    ).toBe('Sun Oct 11 · 0 next actions · 0 due');
    expect(
      nowSubcopy({ localDate: 'Sun Oct 11', nextActionCount: 12, dueCount: 3 })
    ).toBe('Sun Oct 11 · 12 next actions · 3 due');
  });
});

describe('localDateLabel', () => {
  it('formats a weekday, month, and day from the given instant', () => {
    expect(localDateLabel(new Date('2026-10-12T01:00:00.000Z'), 'America/Chicago')).toBe(
      'Sun Oct 11'
    );
  });
});

describe('listsRowLabel', () => {
  it('counts named lists only', () => {
    expect(listsRowLabel(0)).toBe('0 lists');
    expect(listsRowLabel(1)).toBe('1 list');
    expect(listsRowLabel(4)).toBe('4 lists');
  });
});

describe('ownerLabelFor', () => {
  const members = [
    { userId: 'viewer', email: 'justin@example.com', kind: 'human' as const },
    { userId: 'bot', email: 'lane@example.com', name: 'Lane', kind: 'agent' as const },
    { userId: 'other', email: 'polly@example.com', kind: 'human' as const },
  ];

  it('hides unowned and viewer-owned rows', () => {
    expect(ownerLabelFor({}, 'viewer', members)).toBeUndefined();
    expect(ownerLabelFor({ assigneeId: 'viewer' }, 'viewer', members)).toBeUndefined();
  });

  it('shows a bot name and a person email, or the id when the member is gone', () => {
    expect(ownerLabelFor({ assigneeId: 'bot' }, 'viewer', members)).toBe('Lane');
    expect(ownerLabelFor({ assigneeId: 'other' }, 'viewer', members)).toBe(
      'polly@example.com'
    );
    expect(ownerLabelFor({ assigneeId: 'gone' }, 'viewer', members)).toBe('gone');
  });
});
