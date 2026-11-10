import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import type { Clock } from '../../kernel/clock.js';
import type { IdGenerator } from '../../kernel/id-generator.js';
import type { CommitFailure, UnitOfWork } from '../../kernel/unit-of-work.js';
import {
  decideCreateInvitationMembership,
  decideCreateInvitationOrganization,
  decideCreateInvitationPermission,
  planCreateInvitation,
  type CreateInvitationCommand,
  type CreateInvitationRequest,
} from '../domain/decide-create-invitation.js';
import {
  selectInAppPendingInvitations,
  type ListPendingInvitationsQuery,
} from '../domain/decide-list-pending-invitations.js';
import {
  decideRevokeInvitation,
  decideRevokeInvitationMembership,
  planRevokeInvitation,
  type RevokeInvitationCommand,
} from '../domain/decide-revoke-invitation.js';
import {
  decideValidateInvitation,
  type ValidateInvitation,
} from '../domain/decide-validate-invitation.js';
import type { Invitation } from '../domain/invitation.js';
import {
  invitationStorageError,
  type InvitationServiceError,
  type InvitationStorageError,
} from '../domain/invitation-errors.js';
import type { InvitationPlan } from '../domain/invitation-plan.js';
import type { InvitationStore } from '../domain/invitation-store.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import type { OrganizationStore } from '../domain/organization-store.js';

export type { CreateInvitationCommand } from '../domain/decide-create-invitation.js';
export type { ListPendingInvitationsQuery } from '../domain/decide-list-pending-invitations.js';
export type { RevokeInvitationCommand } from '../domain/decide-revoke-invitation.js';

export type ValidateInvitationQuery = ValidateInvitation;

export type CodeGenerator = {
  generate(): string;
};

export type InvitationService = {
  /**
   * Create a new invitation for an organization.
   * Only admins and owners can create invitations.
   */
  createInvitation(command: CreateInvitationCommand): ResultAsync<Invitation, InvitationServiceError>;

  /**
   * Validate an invitation code.
   * Checks existence, expiration, and optionally email match.
   */
  validateInvitation(query: ValidateInvitationQuery): ResultAsync<Invitation, InvitationServiceError>;

  /**
   * List pending invitations for an organization.
   */
  listPendingInvitations(
    query: ListPendingInvitationsQuery
  ): ResultAsync<Invitation[], InvitationServiceError>;

  /**
   * Revoke (delete) an invitation.
   * Only admins and owners of the organization can revoke invitations.
   */
  revokeInvitation(command: RevokeInvitationCommand): ResultAsync<void, InvitationServiceError>;
};

export type InvitationServiceDependencies = {
  invitationStore: InvitationStore;
  organizationStore: OrganizationStore;
  membershipStore: OrganizationMembershipStore;
  clock: Clock;
  idGenerator: IdGenerator;
  codeGenerator: CodeGenerator;
  /**
   * The composition root passes the sqlite unit of work. The plan then
   * commits through the access participant. Tests may omit it and apply
   * the same plan through the invitation store.
   */
  unitOfWork?: UnitOfWork;
};

/**
 * Create, validate, list, and revoke. The command is decided after the
 * queries it needs. A create or revoke plan comes out and is committed.
 * Accept is `handleAcceptInvitation`: that path writes the membership and
 * the accepted invite together. Signup's batch is unchanged.
 */
export const createInvitationService = (deps: InvitationServiceDependencies): InvitationService => {
  const persist = (plan: InvitationPlan): ResultAsync<void, InvitationStorageError> => {
    if (deps.unitOfWork === undefined) {
      return plan.kind === 'create-invitation'
        ? deps.invitationStore.save(plan.invitation)
        : deps.invitationStore.delete(plan.invitationId);
    }
    const message =
      plan.kind === 'create-invitation' ? 'Failed to save invitation' : 'Failed to delete invitation';
    return deps.unitOfWork
      .commit([
        {
          result: null,
          events: [],
          step: { owner: 'access', plan },
        },
      ])
      .map(() => undefined)
      .mapErr((failure: CommitFailure) => invitationStorageError(message, failure));
  };

  const writeInvitation = (
    request: CreateInvitationRequest
  ): ResultAsync<Invitation, InvitationStorageError> => {
    const plan = planCreateInvitation({
      request,
      id: deps.idGenerator.generate(),
      code: deps.codeGenerator.generate(),
      now: deps.clock.now().toISOString(),
    });
    return persist(plan).map(() => plan.invitation);
  };

  return {
    createInvitation(command) {
      return deps.organizationStore.findById(command.organizationId).andThen((organization) => {
        const requested = decideCreateInvitationOrganization({ command, organization });
        if (requested.isErr()) {
          return errAsync(requested.error);
        }
        const request = requested.value;
        const gate = decideCreateInvitationPermission(request);
        if (gate.isErr()) {
          return errAsync(gate.error);
        }
        if (gate.value.kind === 'check-membership') {
          return deps.membershipStore
            .findByUserAndOrg(gate.value.invitedByUserId, request.organizationId)
            .andThen((membership) => {
              const allowed = decideCreateInvitationMembership({ membership });
              if (allowed.isErr()) {
                return errAsync(allowed.error);
              }
              return writeInvitation(request);
            });
        }
        return writeInvitation(request);
      });
    },

    validateInvitation(query) {
      return deps.invitationStore.findByCode(query.code).andThen((invitation) => {
        const decision = decideValidateInvitation({
          query,
          invitation,
          now: deps.clock.now().toISOString(),
        });
        return decision.isOk() ? okAsync(decision.value) : errAsync(decision.error);
      });
    },

    listPendingInvitations(query) {
      const currentTime = deps.clock.now().toISOString();
      return deps.invitationStore
        .findPendingByOrganization(query.organizationId, currentTime)
        .map((invitations) => selectInAppPendingInvitations(invitations));
    },

    revokeInvitation(command) {
      return deps.invitationStore.findById(command.invitationId).andThen((invitation) => {
        const decided = decideRevokeInvitation({ command, invitation });
        if (decided.isErr()) {
          return errAsync(decided.error);
        }
        return deps.membershipStore
          .findByUserAndOrg(command.revokedByUserId, decided.value.organizationId)
          .andThen((membership) => {
            const allowed = decideRevokeInvitationMembership({ membership });
            if (allowed.isErr()) {
              return errAsync(allowed.error);
            }
            const plan = planRevokeInvitation({ invitationId: command.invitationId });
            return persist(plan);
          });
      });
    },
  };
};
