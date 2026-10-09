import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { NamedList } from '@yoink/api-contracts';
import type { ListStore } from '../domain/list-store.js';
import { storageError, type StorageError } from '../domain/list-errors.js';
import { normalizeListName } from '../domain/list-name.js';
import { compareKeyset, pageOrdered } from '../../listing/domain/keyset-window.js';
import { namedListDirection, namedListKeys } from '../../listing/domain/list-keys.js';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';

export type FakeListStoreOptions = {
  shouldFailOnSave?: boolean;
  shouldFailOnUpdate?: boolean;
  shouldFailOnFind?: boolean;
  shouldFailOnRemove?: boolean;
  initialLists?: NamedList[];
};

export type FakeListStore = ListStore & {
  captureSnapshot: () => () => void;
  applyInsert: (list: NamedList) => void;
  applyReplace: (list: NamedList) => void;
  applyRemove: (id: string) => void;
};

export const createFakeListStore = (
  options: FakeListStoreOptions = {}
): FakeListStore => {
  const lists: NamedList[] = [...(options.initialLists ?? [])];

  return {
    captureSnapshot: () => {
      const copy = lists.map((list) => ({ ...list }));
      return () => {
        lists.length = 0;
        lists.push(...copy);
      };
    },
    applyInsert: (list: NamedList) => {
      lists.push(list);
    },
    applyReplace: (list: NamedList) => {
      const index = lists.findIndex((existing) => existing.id === list.id);
      if (index !== -1) {
        lists[index] = list;
      }
    },
    applyRemove: (id: string) => {
      const index = lists.findIndex((list) => list.id === id);
      if (index !== -1) {
        lists.splice(index, 1);
      }
    },
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

    update: (list: NamedList): ResultAsync<void, StorageError> => {
      if (options.shouldFailOnUpdate) {
        return errAsync(storageError('Update failed'));
      }
      const index = lists.findIndex((existing) => existing.id === list.id);
      if (index === -1) {
        return errAsync(storageError('Failed to rename named list'));
      }
      const taken = lists.some(
        (existing) =>
          existing.id !== list.id &&
          existing.organizationId === list.organizationId &&
          normalizeListName(existing.name) === normalizeListName(list.name)
      );
      if (taken) {
        return errAsync(storageError('Failed to rename named list'));
      }
      lists[index] = list;
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
        .sort((a, b) => compareKeyset(namedListKeys(a), namedListKeys(b)));

      return okAsync(filtered);
    },

    pageByOrganization: (query: {
      organizationId: string;
      fetchLimit: number;
      seek?: KeysetCursor;
    }): ResultAsync<KeysetRows<NamedList>, StorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(storageError('Find failed'));
      }
      const ordered = lists
        .filter((list) => list.organizationId === query.organizationId)
        .slice()
        .sort((a, b) => compareKeyset(namedListKeys(a), namedListKeys(b)));
      return okAsync(
        pageOrdered({
          ordered,
          keysOf: namedListKeys,
          direction: namedListDirection,
          fetchLimit: query.fetchLimit,
          seek: query.seek,
        })
      );
    },

    remove: (id: string): ResultAsync<void, StorageError> => {
      if (options.shouldFailOnRemove) {
        return errAsync(storageError('Delete failed'));
      }
      const index = lists.findIndex((list) => list.id === id);
      if (index !== -1) {
        lists.splice(index, 1);
      }
      return okAsync(undefined);
    },
  };
};
