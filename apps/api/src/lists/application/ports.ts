import type { ResultAsync } from 'neverthrow';
import type { NamedList } from '@yoink/api-contracts';
import type { StorageError } from '../domain/list-errors.js';

export type ListNamedLists = (
  organizationId: string
) => ResultAsync<NamedList[], StorageError>;

export type SaveNamedList = (list: NamedList) => ResultAsync<void, StorageError>;
