import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import { normalizeEmail } from '@yoink/api-contracts';
import type { User } from '../domain/user.js';
import type { UserStore } from '../domain/user-store.js';
import {
  userNotFoundError,
  userStorageError,
  type UserStorageError,
} from '../domain/user-errors.js';

export type FakeUserStoreOptions = {
  shouldFailOnSave?: boolean;
  shouldFailOnFind?: boolean;
  initialUsers?: User[];
};

export const createFakeUserStore = (
  options: FakeUserStoreOptions = {}
): UserStore => {
  const users: User[] = [...(options.initialUsers ?? [])];

  return {
    save: (user: User): ResultAsync<void, UserStorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(userStorageError('Save failed'));
      }
      const index = users.findIndex((existing) => existing.id === user.id);
      if (index >= 0) {
        users[index] = user;
      } else {
        users.push(user);
      }
      return okAsync(undefined);
    },

    updateName: (id: string, name: string) => {
      if (options.shouldFailOnSave) {
        return errAsync(userStorageError('Save failed'));
      }
      const index = users.findIndex((existing) => existing.id === id);
      if (index < 0) {
        return errAsync(userNotFoundError(id));
      }
      const current = users[index];
      if (!current) {
        return errAsync(userNotFoundError(id));
      }
      users[index] = { ...current, name };
      return okAsync(undefined);
    },

    findById: (id: string): ResultAsync<User | null, UserStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(userStorageError('Find failed'));
      }
      const found = users.find((u) => u.id === id);
      return okAsync(found ?? null);
    },

    findByEmail: (email: string): ResultAsync<User | null, UserStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(userStorageError('Find failed'));
      }
      const found = users.find((u) => u.email === email);
      return okAsync(found ?? null);
    },

    findByNormalizedEmail: (email: string): ResultAsync<User | null, UserStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(userStorageError('Find failed'));
      }
      const found = users.find((u) => normalizeEmail(u.email) === email);
      return okAsync(found ?? null);
    },

    findByIds: (ids: string[]): ResultAsync<User[], UserStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(userStorageError('Find failed'));
      }
      const found = users.filter((u) => ids.includes(u.id));
      return okAsync(found);
    },
  };
};
