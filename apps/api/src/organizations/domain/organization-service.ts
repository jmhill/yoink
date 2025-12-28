import type { ResultAsync } from 'neverthrow';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { Organization } from './organization.js';
import type { OrganizationStore } from './organization-store.js';
import type { OrganizationServiceError } from './organization-errors.js';

// ============================================================================
// Commands (input types)
// ============================================================================

export type CreateOrganizationCommand = {
  /** Optional - will be generated if not provided */
  id?: string;
  name: string;
  /** Optional - will use current time if not provided */
  createdAt?: string;
};

// ============================================================================
// Service Interface
// ============================================================================

export type OrganizationService = {
  /**
   * Get an organization by ID.
   * Returns null if organization not found.
   */
  getOrganization(organizationId: string): ResultAsync<Organization | null, OrganizationServiceError>;

  /**
   * List all organizations.
   */
  listOrganizations(): ResultAsync<Organization[], OrganizationServiceError>;

  /**
   * Create a new organization.
   */
  createOrganization(command: CreateOrganizationCommand): ResultAsync<Organization, OrganizationServiceError>;
};

// ============================================================================
// Dependencies
// ============================================================================

export type OrganizationServiceDependencies = {
  organizationStore: OrganizationStore;
  clock: Clock;
  idGenerator: IdGenerator;
};

// ============================================================================
// Implementation
// ============================================================================

export const createOrganizationService = (
  deps: OrganizationServiceDependencies
): OrganizationService => {
  const { organizationStore, clock, idGenerator } = deps;

  return {
    getOrganization(organizationId: string): ResultAsync<Organization | null, OrganizationServiceError> {
      return organizationStore.findById(organizationId);
    },

    listOrganizations(): ResultAsync<Organization[], OrganizationServiceError> {
      return organizationStore.findAll();
    },

    createOrganization(command: CreateOrganizationCommand): ResultAsync<Organization, OrganizationServiceError> {
      const organization: Organization = {
        id: command.id ?? idGenerator.generate(),
        name: command.name,
        createdAt: command.createdAt ?? clock.now().toISOString(),
      };

      return organizationStore.save(organization).map(() => organization);
    },
  };
};
