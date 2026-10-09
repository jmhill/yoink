import type { ResultAsync } from 'neverthrow';
import type { NamedList } from '@yoink/api-contracts';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import type { StorageError } from './list-errors.js';

export type ListStore = {
  findById(id: string): ResultAsync<NamedList | null, StorageError>;
  findByOrganization(organizationId: string): ResultAsync<NamedList[], StorageError>;
  pageByOrganization(options: {
    organizationId: string;
    fetchLimit: number;
    seek?: KeysetCursor;
  }): ResultAsync<KeysetRows<NamedList>, StorageError>;
};
