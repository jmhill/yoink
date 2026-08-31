import { describe, it, expect } from 'vitest';
import { decideCreateNamedList } from './decide-create.js';

describe('decideCreateNamedList', () => {
  const command = {
    name: 'Groceries',
    organizationId: 'org-123',
    createdById: 'user-456',
  };

  it('decides a NamedListCreated fact with generated id and timestamp', () => {
    const result = decideCreateNamedList({
      command,
      existingNames: [],
      id: 'list-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'NamedListCreated',
        id: 'list-id-1',
        organizationId: 'org-123',
        createdById: 'user-456',
        name: 'Groceries',
        createdAt: '2025-01-15T10:00:00.000Z',
      });
    }
  });

  it('trims surrounding whitespace from the name', () => {
    const result = decideCreateNamedList({
      command: { ...command, name: '  Weekend  ' },
      existingNames: [],
      id: 'list-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.name).toBe('Weekend');
    }
  });

  it('rejects an empty name', () => {
    const result = decideCreateNamedList({
      command: { ...command, name: '' },
      existingNames: [],
      id: 'list-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_LIST_NAME');
    }
  });

  it('rejects a whitespace-only name', () => {
    const result = decideCreateNamedList({
      command: { ...command, name: '   ' },
      existingNames: [],
      id: 'list-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_LIST_NAME');
    }
  });

  it('rejects a name over 200 characters', () => {
    const result = decideCreateNamedList({
      command: { ...command, name: 'a'.repeat(201) },
      existingNames: [],
      id: 'list-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_LIST_NAME');
    }
  });

  it('accepts a name at exactly 200 characters', () => {
    const name = 'a'.repeat(200);
    const result = decideCreateNamedList({
      command: { ...command, name },
      existingNames: [],
      id: 'list-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.name).toBe(name);
    }
  });

  it('rejects a name already used in the organization', () => {
    const result = decideCreateNamedList({
      command,
      existingNames: ['Groceries'],
      id: 'list-id-2',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('DUPLICATE_LIST_NAME');
    }
  });

  it('rejects a name that matches an existing list ignoring case', () => {
    const result = decideCreateNamedList({
      command: { ...command, name: 'groceries' },
      existingNames: ['Groceries'],
      id: 'list-id-2',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('DUPLICATE_LIST_NAME');
    }
  });

  it('compares after trim when checking uniqueness', () => {
    const result = decideCreateNamedList({
      command: { ...command, name: '  GROCERIES  ' },
      existingNames: ['Groceries'],
      id: 'list-id-2',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('DUPLICATE_LIST_NAME');
    }
  });

  it('allows a different name in the same organization', () => {
    const result = decideCreateNamedList({
      command: { ...command, name: 'Weekend' },
      existingNames: ['Groceries'],
      id: 'list-id-2',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.name).toBe('Weekend');
    }
  });
});
