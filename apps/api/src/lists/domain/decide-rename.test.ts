import { describe, it, expect } from 'vitest';
import type { NamedList } from '@yoink/api-contracts';
import { decideRenameNamedList } from './decide-rename.js';

const groceries: NamedList = {
  id: 'list-groceries',
  organizationId: 'org-123',
  createdById: 'user-456',
  name: 'groceries',
  createdAt: '2025-01-15T10:00:00.000Z',
};

const command = {
  id: groceries.id,
  organizationId: groceries.organizationId,
  name: 'Shopping',
};

describe('decideRenameNamedList', () => {
  it('decides a NamedListRenamed fact with the trimmed name', () => {
    const result = decideRenameNamedList({
      command: { ...command, name: '  Shopping  ' },
      current: groceries,
      existingNames: [groceries.name, 'Weekend'],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'NamedListRenamed',
        id: 'list-groceries',
        organizationId: 'org-123',
        name: 'Shopping',
      });
    }
  });

  it('rejects an empty name', () => {
    const result = decideRenameNamedList({
      command: { ...command, name: '' },
      current: groceries,
      existingNames: [groceries.name],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_LIST_NAME');
    }
  });

  it('rejects a whitespace-only name', () => {
    const result = decideRenameNamedList({
      command: { ...command, name: '   ' },
      current: groceries,
      existingNames: [groceries.name],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_LIST_NAME');
    }
  });

  it('rejects a name over 200 characters', () => {
    const result = decideRenameNamedList({
      command: { ...command, name: 'a'.repeat(201) },
      current: groceries,
      existingNames: [groceries.name],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_LIST_NAME');
    }
  });

  it('accepts a name at exactly 200 characters', () => {
    const name = 'a'.repeat(200);
    const result = decideRenameNamedList({
      command: { ...command, name },
      current: groceries,
      existingNames: [groceries.name],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.name).toBe(name);
    }
  });

  it('rejects a name another list in the organization already has ignoring case', () => {
    const result = decideRenameNamedList({
      command: { ...command, name: 'weekend' },
      current: groceries,
      existingNames: [groceries.name, 'Weekend'],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('DUPLICATE_LIST_NAME');
    }
  });

  it('excludes the list’s own current name from the duplicate check', () => {
    const result = decideRenameNamedList({
      command: { ...command, name: 'groceries' },
      current: groceries,
      existingNames: [groceries.name, 'Weekend'],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.name).toBe('groceries');
    }
  });

  it('allows changing only the capitalization of its own name', () => {
    const result = decideRenameNamedList({
      command: { ...command, name: 'Groceries' },
      current: groceries,
      existingNames: [groceries.name, 'Weekend'],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.name).toBe('Groceries');
    }
  });

  it('compares after trim when checking uniqueness against other lists', () => {
    const result = decideRenameNamedList({
      command: { ...command, name: '  WEEKEND  ' },
      current: groceries,
      existingNames: [groceries.name, 'Weekend'],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('DUPLICATE_LIST_NAME');
    }
  });

  it('rejects a missing list', () => {
    const result = decideRenameNamedList({
      command,
      current: null,
      existingNames: [],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_FOUND');
    }
  });

  it('rejects a list from another organization as not found', () => {
    const result = decideRenameNamedList({
      command,
      current: { ...groceries, organizationId: 'org-other' },
      existingNames: [groceries.name],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_FOUND');
    }
  });
});
