import { describe, it, expect } from 'vitest';
import { parseTokenName, tokenNameIsTaken } from './token-name.js';

describe('parseTokenName', () => {
  it('trims surrounding whitespace', () => {
    const result = parseTokenName('  Lane  ');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe('Lane');
    }
  });

  it('rejects a blank name', () => {
    const result = parseTokenName('   ');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_TOKEN_NAME');
    }
  });

  it('rejects a name over 200 characters', () => {
    const result = parseTokenName('a'.repeat(201));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_TOKEN_NAME');
    }
  });

  it('accepts a name at exactly 200 characters', () => {
    const name = 'a'.repeat(200);
    const result = parseTokenName(name);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(name);
    }
  });
});

describe('tokenNameIsTaken', () => {
  it('matches after trim and case fold', () => {
    expect(tokenNameIsTaken('  LANE  ', ['Lane'])).toBe(true);
    expect(tokenNameIsTaken('Charlie', ['Lane'])).toBe(false);
  });
});
