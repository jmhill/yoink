import type { ResultAsync } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import type { StorageError } from './project-errors.js';

export type ProjectStore = {
  findById(id: string): ResultAsync<Project | null, StorageError>;
  findByOrganization(organizationId: string): ResultAsync<Project[], StorageError>;
  pageByOrganization(options: {
    organizationId: string;
    fetchLimit: number;
    seek?: KeysetCursor;
  }): ResultAsync<KeysetRows<Project>, StorageError>;
};
