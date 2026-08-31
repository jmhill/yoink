import type { ResultAsync } from 'neverthrow';
import type { NamedList } from '@yoink/api-contracts';
import type { StorageError } from '../domain/list-errors.js';
import type { NamedListEvent } from '../domain/events.js';

export type ListNamedLists = (
  organizationId: string
) => ResultAsync<NamedList[], StorageError>;

export type PersistNamedListEvent = (input: {
  event: NamedListEvent;
}) => ResultAsync<void, StorageError>;
