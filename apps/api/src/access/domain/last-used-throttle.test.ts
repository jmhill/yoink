import { describe, it, expect } from 'vitest';
import { shouldUpdateLastUsed } from './last-used-throttle.js';

describe('shouldUpdateLastUsed', () => {
  const now = new Date('2026-10-09T12:00:00.000Z');

  it('writes when the token has never been used', () => {
    expect(shouldUpdateLastUsed(undefined, now)).toBe(true);
  });

  it('skips a write within the same minute', () => {
    expect(shouldUpdateLastUsed('2026-10-09T11:59:30.000Z', now)).toBe(false);
  });

  it('writes again after a minute', () => {
    expect(shouldUpdateLastUsed('2026-10-09T11:59:00.000Z', now)).toBe(true);
  });
});
