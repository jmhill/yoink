import { describe, it, expect } from 'vitest';
import {
  ENTITY_NAME_MAX_LENGTH,
  entityNameIsTaken,
  normalizeEntityName,
  parseEntityName,
} from './name.js';

describe('parseEntityName', () => {
  it('trims surrounding whitespace', () => {
    const result = parseEntityName('  Weekend  ');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe('Weekend');
    }
  });

  it('rejects an empty name', () => {
    const result = parseEntityName('');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe('empty');
    }
  });

  it('rejects a whitespace-only name', () => {
    const result = parseEntityName('   ');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe('empty');
    }
  });

  it('rejects a name over 200 characters', () => {
    const result = parseEntityName('a'.repeat(ENTITY_NAME_MAX_LENGTH + 1));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe('too_long');
    }
  });

  it('accepts a name at exactly 200 characters', () => {
    const name = 'a'.repeat(ENTITY_NAME_MAX_LENGTH);
    const result = parseEntityName(name);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(name);
    }
  });
});

describe('normalizeEntityName', () => {
  it('lowercases after trim', () => {
    expect(normalizeEntityName('  Groceries  ')).toBe('groceries');
  });
});

describe('entityNameIsTaken', () => {
  it('treats names as taken ignoring case', () => {
    expect(entityNameIsTaken('groceries', ['Groceries'])).toBe(true);
  });

  it('allows a different name', () => {
    expect(entityNameIsTaken('Weekend', ['Groceries'])).toBe(false);
  });
});
