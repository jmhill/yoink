import type { ResultAsync } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import type { ProjectNotFoundError, StorageError } from './project-errors.js';

export type ProjectStore = {
  findById(id: string): ResultAsync<Project | null, StorageError>;
  updateCreatedAt(
    id: string,
    createdAt: string
  ): ResultAsync<void, StorageError | ProjectNotFoundError>;
  findByOrganization(organizationId: string): ResultAsync<Project[], StorageError>;
  pageByOrganization(options: {
    organizationId: string;
    fetchLimit: number;
    seek?: KeysetCursor;
    statuses?: readonly Project['status'][];
    createdById?: string;
  }): ResultAsync<KeysetRows<Project>, StorageError>;
};
