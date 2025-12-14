import type { ResultAsync } from 'neverthrow';
import type { Organization } from './organization.js';
import type { OrganizationStorageError } from './auth-errors.js';

export type OrganizationStore = {
  save(organization: Organization): ResultAsync<void, OrganizationStorageError>;
  findById(id: string): ResultAsync<Organization | null, OrganizationStorageError>;
  findAll(): ResultAsync<Organization[], OrganizationStorageError>;
};
