import { describe, it, expect } from 'vitest';
import type { NamedList } from '@yoink/api-contracts';
import { decideDeleteNamedList } from './decide-delete.js';

const groceries: NamedList = {
  id: 'list-groceries',
  organizationId: 'org-123',
  createdById: 'user-456',
  name: 'Groceries',
  createdAt: '2025-01-15T10:00:00.000Z',
};

const command = {
  id: groceries.id,
  organizationId: groceries.organizationId,
};

describe('decideDeleteNamedList', () => {
  it('decides a NamedListDeleted fact when the list has no open tasks', () => {
    const result = decideDeleteNamedList({
      command,
      current: groceries,
      openTaskCount: 0,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'NamedListDeleted',
        id: 'list-groceries',
        organizationId: 'org-123',
      });
    }
  });

  it('allows delete when only completed tasks are on the list', () => {
    const result = decideDeleteNamedList({
      command,
      current: groceries,
      openTaskCount: 0,
    });

    expect(result.isOk()).toBe(true);
  });

  it('refuses delete when any open task is still on the list', () => {
    const result = decideDeleteNamedList({
      command,
      current: groceries,
      openTaskCount: 2,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_HAS_OPEN_TASKS');
      if (result.error.type === 'LIST_HAS_OPEN_TASKS') {
        expect(result.error.id).toBe('list-groceries');
        expect(result.error.openTaskCount).toBe(2);
      }
    }
  });

  it('rejects a missing list', () => {
    const result = decideDeleteNamedList({
      command,
      current: null,
      openTaskCount: 0,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_FOUND');
    }
  });

  it('rejects a list from another organization as not found', () => {
    const result = decideDeleteNamedList({
      command,
      current: { ...groceries, organizationId: 'org-other' },
      openTaskCount: 0,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_FOUND');
    }
  });
});
