import type { ResultAsync } from 'neverthrow';
import type { User } from './user.js';
import type { UserNotFoundError, UserStorageError } from './user-errors.js';

export type UserStore = {
  save(user: User): ResultAsync<void, UserStorageError>;
  findById(id: string): ResultAsync<User | null, UserStorageError>;
  findByEmail(email: string): ResultAsync<User | null, UserStorageError>;
  findByIds(ids: string[]): ResultAsync<User[], UserStorageError>;
  updateName(id: string, name: string): ResultAsync<void, UserStorageError | UserNotFoundError>;
};
