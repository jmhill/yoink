import type { ResultAsync } from 'neverthrow';
import type { Clock } from '../../kernel/clock.js';
import type { IdGenerator } from '../../kernel/id-generator.js';
import type { CommitFailure, UnitOfWork } from '../../kernel/unit-of-work.js';
import {
  decideSaveOrganization,
  planSaveOrganization,
  type CreateOrganizationCommand,
} from '../domain/decide-save-organization.js';
import type { Organization } from '../domain/organization.js';
import {
  organizationStorageError,
  type OrganizationServiceError,
  type OrganizationStorageError,
} from '../domain/organization-errors.js';
import type { OrganizationPlan } from '../domain/organization-plan.js';
import type { OrganizationStore } from '../domain/organization-store.js';

export type { CreateOrganizationCommand } from '../domain/decide-save-organization.js';

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

export type OrganizationServiceDependencies = {
  organizationStore: OrganizationStore;
  clock: Clock;
  idGenerator: IdGenerator;
  /**
   * The composition root passes the sqlite unit of work. The plan then
   * commits through the access participant. Tests may omit it and apply
   * the same plan through the organization store.
   */
  unitOfWork?: UnitOfWork;
};

/**
 * Get and list stay reads. Create takes the command, decides, and commits
 * one organization plan. There is no query on that write. The upsert does
 * not write `notes_mirror_bot_user_id`. Admin create and rename stay on
 * `createAdminService`.
 */
export const createOrganizationService = (
  deps: OrganizationServiceDependencies
): OrganizationService => {
  const persist = (plan: OrganizationPlan): ResultAsync<void, OrganizationStorageError> => {
    if (deps.unitOfWork === undefined) {
      return deps.organizationStore.save(plan.organization);
    }
    return deps.unitOfWork
      .commit([
        {
          result: null,
          events: [],
          step: { owner: 'access', plan },
        },
      ])
      .map(() => undefined)
      .mapErr((failure: CommitFailure) =>
        organizationStorageError('Failed to save organization', failure)
      );
  };

  return {
    getOrganization(organizationId: string): ResultAsync<Organization | null, OrganizationServiceError> {
      return deps.organizationStore.findById(organizationId);
    },

    listOrganizations(): ResultAsync<Organization[], OrganizationServiceError> {
      return deps.organizationStore.findAll();
    },

    createOrganization(command: CreateOrganizationCommand): ResultAsync<Organization, OrganizationServiceError> {
      const decision = decideSaveOrganization(command);
      const plan = planSaveOrganization({
        decision,
        generatedId: decision.id ?? deps.idGenerator.generate(),
        now: decision.createdAt ?? deps.clock.now().toISOString(),
      });
      return persist(plan).map(() => plan.organization);
    },
  };
};
