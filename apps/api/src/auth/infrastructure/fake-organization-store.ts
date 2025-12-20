import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { Organization } from '../domain/organization.js';
import type { OrganizationStore } from '../domain/organization-store.js';
import {
  organizationStorageError,
  type OrganizationStorageError,
} from '../domain/auth-errors.js';

export type FakeOrganizationStoreOptions = {
  shouldFailOnSave?: boolean;
  shouldFailOnFind?: boolean;
  initialOrganizations?: Organization[];
};

export const createFakeOrganizationStore = (
  options: FakeOrganizationStoreOptions = {}
): OrganizationStore => {
  const organizations: Organization[] = [...(options.initialOrganizations ?? [])];

  return {
    save: (organization: Organization): ResultAsync<void, OrganizationStorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(organizationStorageError('Save failed'));
      }
      const existingIndex = organizations.findIndex((o) => o.id === organization.id);
      if (existingIndex >= 0) {
        organizations[existingIndex] = organization;
      } else {
        organizations.push(organization);
      }
      return okAsync(undefined);
    },

    findById: (id: string): ResultAsync<Organization | null, OrganizationStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(organizationStorageError('Find failed'));
      }
      const found = organizations.find((o) => o.id === id);
      return okAsync(found ?? null);
    },

    findAll: (): ResultAsync<Organization[], OrganizationStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(organizationStorageError('Find failed'));
      }
      return okAsync([...organizations]);
    },
  };
};
