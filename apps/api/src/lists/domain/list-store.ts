import type { ResultAsync } from 'neverthrow';
import type { NamedList } from '@yoink/api-contracts';
import type { StorageError } from './list-errors.js';

export type ListStore = {
  save(list: NamedList): ResultAsync<void, StorageError>;
  findByOrganization(organizationId: string): ResultAsync<NamedList[], StorageError>;
};
