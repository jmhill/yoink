import type { ResultAsync } from 'neverthrow';
import type { User } from './user.js';
import type { UserStorageError } from './auth-errors.js';

export type UserStore = {
  save(user: User): ResultAsync<void, UserStorageError>;
  findById(id: string): ResultAsync<User | null, UserStorageError>;
  findByOrganizationId(organizationId: string): ResultAsync<User[], UserStorageError>;
};
