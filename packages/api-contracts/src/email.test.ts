import { describe, it, expect } from 'vitest';
import { normalizeEmail } from './email.js';

describe('normalizeEmail', () => {
  it('trims surrounding spaces and lowercases', () => {
    expect(normalizeEmail('  Justin@Example.COM  ')).toBe('justin@example.com');
  });
});
