import { describe, it, expect } from 'vitest';
import {
  NAMED_LIST_NAME_MAX_LENGTH,
  listNameIsTaken,
  parseListName,
} from './list-name.js';

describe('parseListName', () => {
  it('trims surrounding whitespace', () => {
    const result = parseListName('  Weekend  ');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe('Weekend');
    }
  });

  it('rejects an empty name', () => {
    const result = parseListName('');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_LIST_NAME');
    }
  });

  it('rejects a whitespace-only name', () => {
    const result = parseListName('   ');
    expect(result.isErr()).toBe(true);
  });

  it('rejects a name over 200 characters', () => {
    const result = parseListName('a'.repeat(NAMED_LIST_NAME_MAX_LENGTH + 1));
    expect(result.isErr()).toBe(true);
  });

  it('accepts a name at exactly 200 characters', () => {
    const name = 'a'.repeat(NAMED_LIST_NAME_MAX_LENGTH);
    const result = parseListName(name);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(name);
    }
  });
});

describe('listNameIsTaken', () => {
  it('treats names as taken ignoring case', () => {
    expect(listNameIsTaken('groceries', ['Groceries'])).toBe(true);
  });

  it('allows a different name', () => {
    expect(listNameIsTaken('Weekend', ['Groceries'])).toBe(false);
  });
});
