import { describe, it, expect } from 'vitest';
import { okAsync, errAsync } from 'neverthrow';
import type { NamedList } from '@yoink/api-contracts';
import { handleListNamedLists } from './handle-list-named-lists.js';
import { storageError } from '../domain/list-errors.js';

const groceries: NamedList = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Groceries',
  createdAt: '2025-01-15T10:00:00.000Z',
  createdById: '550e8400-e29b-41d4-a716-446655440002',
};

describe('handleListNamedLists', () => {
  it('loads and returns the organization lists — no events', async () => {
    const result = await handleListNamedLists(
      { organizationId: groceries.organizationId },
      {
        list: (organizationId) => {
          expect(organizationId).toBe(groceries.organizationId);
          return okAsync([groceries]);
        },
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([groceries]);
    }
  });

  it('returns an empty array when the organization has no lists', async () => {
    const result = await handleListNamedLists(
      { organizationId: groceries.organizationId },
      {
        list: () => okAsync([]),
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
  });

  it('forwards storage errors', async () => {
    const result = await handleListNamedLists(
      { organizationId: groceries.organizationId },
      {
        list: () => errAsync(storageError('Find failed')),
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
  });
});
