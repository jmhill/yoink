import { describe, expect, it } from 'vitest';
import { isIanaTimeZone } from './time-zone.js';

describe('isIanaTimeZone', () => {
  it('accepts a zone Intl accepts and rejects an empty or unknown one', () => {
    expect(isIanaTimeZone('America/Chicago')).toBe(true);
    expect(isIanaTimeZone('UTC')).toBe(true);
    expect(isIanaTimeZone('')).toBe(false);
    expect(isIanaTimeZone('Mars/Base')).toBe(false);
  });
});
