import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { NamedList } from '@yoink/api-contracts';
import type { ListStore } from '../domain/list-store.js';
import { storageError, type StorageError } from '../domain/list-errors.js';
import { normalizeListName } from '../domain/list-name.js';

export type FakeListStoreOptions = {
  shouldFailOnSave?: boolean;
  shouldFailOnFind?: boolean;
  initialLists?: NamedList[];
};

export const createFakeListStore = (
  options: FakeListStoreOptions = {}
): ListStore => {
  const lists: NamedList[] = [...(options.initialLists ?? [])];

  return {
    save: (list: NamedList): ResultAsync<void, StorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(storageError('Save failed'));
      }
      const taken = lists.some(
        (existing) =>
          existing.organizationId === list.organizationId &&
          normalizeListName(existing.name) === normalizeListName(list.name)
      );
      if (taken) {
        return errAsync(storageError('Failed to save named list'));
      }
      lists.push(list);
      return okAsync(undefined);
    },

    findById: (id: string): ResultAsync<NamedList | null, StorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(storageError('Find failed'));
      }
      const found = lists.find((list) => list.id === id);
      return okAsync(found ?? null);
    },

    findByOrganization: (
      organizationId: string
    ): ResultAsync<NamedList[], StorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(storageError('Find failed'));
      }

      const filtered = lists
        .filter((list) => list.organizationId === organizationId)
        .slice()
        .sort((a, b) => {
          const byName = a.name.localeCompare(b.name);
          if (byName !== 0) return byName;
          return a.createdAt.localeCompare(b.createdAt);
        });

      return okAsync(filtered);
    },
  };
};
