import { describe, it, expect } from 'vitest';
import { okAsync, errAsync } from 'neverthrow';
import type { NamedList } from '@yoink/api-contracts';
import { handleListNamedLists } from './handle-list-named-lists.js';
import { storageError } from '../domain/list-errors.js';
import { namedListCursor } from '../../listing/domain/list-keys.js';
import { encodeKeysetCursor } from '../../listing/application/keyset-codec.js';

const groceries: NamedList = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Groceries',
  createdAt: '2025-01-15T10:00:00.000Z',
  createdById: '550e8400-e29b-41d4-a716-446655440002',
};

describe('handleListNamedLists', () => {
  it('assembles a listed page from n+1 store rows', async () => {
    const result = await handleListNamedLists(
      { organizationId: groceries.organizationId },
      {
        pageNamedLists: (options) => {
          expect(options.organizationId).toBe(groceries.organizationId);
          expect(options.fetchLimit).toBe(1001);
          return okAsync({ rows: [groceries], total: 1 });
        },
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        items: [groceries],
        hasMore: false,
        nextCursor: null,
        total: 1,
      });
    }
  });

  it('returns an empty page when the organization has no lists', async () => {
    const result = await handleListNamedLists(
      { organizationId: groceries.organizationId },
      {
        pageNamedLists: () => okAsync({ rows: [], total: 0 }),
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items).toEqual([]);
      expect(result.value.hasMore).toBe(false);
      expect(result.value.total).toBe(0);
    }
  });

  it('returns InvalidCursor without loading when the cursor is malformed', async () => {
    const result = await handleListNamedLists(
      { organizationId: groceries.organizationId, cursor: 'nope' },
      {
        pageNamedLists: () => errAsync(storageError('store should not load')),
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_CURSOR');
    }
  });

  it('forwards storage errors', async () => {
    const result = await handleListNamedLists(
      { organizationId: groceries.organizationId },
      {
        pageNamedLists: () => errAsync(storageError('Find failed')),
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
  });

  it('encodes a keyset nextCursor when more rows exist', async () => {
    const weekend: NamedList = {
      ...groceries,
      id: '550e8400-e29b-41d4-a716-446655440011',
      name: 'Weekend',
    };
    const result = await handleListNamedLists(
      { organizationId: groceries.organizationId, limit: 1 },
      {
        pageNamedLists: () => okAsync({ rows: [groceries, weekend], total: 2 }),
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items).toEqual([groceries]);
      expect(result.value.hasMore).toBe(true);
      expect(result.value.nextCursor).toBe(encodeKeysetCursor(namedListCursor.of(groceries)));
      expect(result.value.total).toBe(2);
    }
  });
});
