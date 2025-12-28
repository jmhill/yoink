import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { User } from '../domain/user.js';
import type { UserStore } from '../domain/user-store.js';
import { userStorageError, type UserStorageError } from '../domain/user-errors.js';

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
      users.push(user);
      return okAsync(undefined);
    },

    findById: (id: string): ResultAsync<User | null, UserStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(userStorageError('Find failed'));
      }
      const found = users.find((u) => u.id === id);
      return okAsync(found ?? null);
    },

    findByOrganizationId: (organizationId: string): ResultAsync<User[], UserStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(userStorageError('Find failed'));
      }
      const found = users.filter((u) => u.organizationId === organizationId);
      return okAsync(found);
    },
  };
};
