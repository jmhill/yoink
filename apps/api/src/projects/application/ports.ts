import type { ResultAsync } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import type { DuplicateProjectNameError, StorageError } from '../domain/project-errors.js';
import type { ProjectChangePlan } from '../domain/plan-project-change.js';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';

export type ListProjects = (organizationId: string) => ResultAsync<Project[], StorageError>;

export type PageProjects = (options: {
  organizationId: string;
  fetchLimit: number;
  seek?: KeysetCursor;
}) => ResultAsync<KeysetRows<Project>, StorageError>;

export type LoadProject = (id: string) => ResultAsync<Project | null, StorageError>;

export type PersistProjectChange = (
  plan: ProjectChangePlan
) => ResultAsync<void, StorageError | DuplicateProjectNameError>;
