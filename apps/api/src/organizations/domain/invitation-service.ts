import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { Invitation, InvitationRole } from './invitation.js';
import type { InvitationStore } from './invitation-store.js';
import type { OrganizationStore } from './organization-store.js';
import type { OrganizationMembershipStore } from './organization-membership-store.js';
import {
  invitationNotFoundError,
  invitationExpiredError,
  invitationAlreadyAcceptedError,
  invitationEmailMismatchError,
  invitationOrgNotFoundError,
  insufficientInvitePermissionsError,
  type InvitationServiceError,
} from './invitation-errors.js';
import { isInvitationExpired, isInvitationAccepted } from './invitation.js';

// ============================================================================
// Commands (input types)
// ============================================================================

export type CreateInvitationCommand = {
  organizationId: string;
  /** The user creating the invitation. Null for admin-created invitations. */
  invitedByUserId: string | null;
  role: InvitationRole;
  /** Optional email restriction - only this email can use the invitation */
  email?: string;
  /** Optional custom expiry (default 7 days from now) */
  expiresInDays?: number;
  /** Skip permission check (for admin-created invitations) */
  skipPermissionCheck?: boolean;
};

export type ValidateInvitationQuery = {
  code: string;
  /** If provided, checks that email matches the invitation's email restriction */
  email?: string;
};

export type AcceptInvitationCommand = {
  code: string;
  userId: string;
};

export type ListPendingInvitationsQuery = {
  organizationId: string;
};

// ============================================================================
// Service Interface
// ============================================================================

export type InvitationService = {
  /**
   * Create a new invitation for an organization.
   * Only admins/owners can create invitations.
   */
  createInvitation(
    command: CreateInvitationCommand
  ): ResultAsync<Invitation, InvitationServiceError>;

  /**
   * Validate an invitation code.
   * Checks existence, expiration, and optionally email match.
   */
  validateInvitation(
    query: ValidateInvitationQuery
  ): ResultAsync<Invitation, InvitationServiceError>;

  /**
   * Accept an invitation, marking it as used.
   * Does NOT create membership - that's done by the signup flow.
   */
  acceptInvitation(
    command: AcceptInvitationCommand
  ): ResultAsync<Invitation, InvitationServiceError>;

  /**
   * List pending invitations for an organization.
   */
  listPendingInvitations(
    query: ListPendingInvitationsQuery
  ): ResultAsync<Invitation[], InvitationServiceError>;
};

// ============================================================================
// Dependencies
// ============================================================================

export type CodeGenerator = {
  generate(): string;
};

export type InvitationServiceDependencies = {
  invitationStore: InvitationStore;
  organizationStore: OrganizationStore;
  membershipStore: OrganizationMembershipStore;
  clock: Clock;
  idGenerator: IdGenerator;
  codeGenerator: CodeGenerator;
};

// ============================================================================
// Implementation
// ============================================================================

const DEFAULT_EXPIRY_DAYS = 7;

export const createInvitationService = (
  deps: InvitationServiceDependencies
): InvitationService => {
  const { invitationStore, organizationStore, membershipStore, clock, idGenerator, codeGenerator } =
    deps;

  return {
    createInvitation(
      command: CreateInvitationCommand
    ): ResultAsync<Invitation, InvitationServiceError> {
      const {
        organizationId,
        invitedByUserId,
        role,
        email,
        expiresInDays = DEFAULT_EXPIRY_DAYS,
        skipPermissionCheck = false,
      } = command;

      // Check organization exists
      return organizationStore.findById(organizationId).andThen((org) => {
        if (!org) {
          return errAsync(invitationOrgNotFoundError(organizationId));
        }

        // Helper to create the invitation (shared between both paths)
        const createInvitationRecord = (): ResultAsync<Invitation, InvitationServiceError> => {
          const now = clock.now();
          const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

          const invitation: Invitation = {
            id: idGenerator.generate(),
            code: codeGenerator.generate(),
            email: email ?? null,
            organizationId,
            invitedByUserId,
            role,
            expiresAt: expiresAt.toISOString(),
            acceptedAt: null,
            acceptedByUserId: null,
            createdAt: now.toISOString(),
          };

          return invitationStore.save(invitation).map(() => invitation);
        };

        // Skip permission check for admin-created invitations
        if (skipPermissionCheck) {
          return createInvitationRecord();
        }

        // For non-admin invitations, invitedByUserId is required
        if (!invitedByUserId) {
          return errAsync(
            insufficientInvitePermissionsError('admin', 'none')
          );
        }

        // Check inviter has permission (must be admin or owner)
        return membershipStore
          .findByUserAndOrg(invitedByUserId, organizationId)
          .andThen((membership) => {
            if (!membership || (membership.role !== 'admin' && membership.role !== 'owner')) {
              return errAsync(
                insufficientInvitePermissionsError('admin', membership?.role ?? 'none')
              );
            }

            return createInvitationRecord();
          });
      });
    },

    validateInvitation(
      query: ValidateInvitationQuery
    ): ResultAsync<Invitation, InvitationServiceError> {
      const { code, email } = query;

      return invitationStore.findByCode(code).andThen((invitation) => {
        if (!invitation) {
          return errAsync(invitationNotFoundError({ code }));
        }

        const currentTime = clock.now().toISOString();

        // Check if expired
        if (isInvitationExpired(invitation, currentTime)) {
          return errAsync(invitationExpiredError(code, invitation.expiresAt));
        }

        // Check if already accepted
        if (isInvitationAccepted(invitation)) {
          return errAsync(invitationAlreadyAcceptedError(code, invitation.acceptedAt!));
        }

        // Check email match if invitation has email restriction and email was provided
        if (invitation.email && email && invitation.email !== email) {
          return errAsync(invitationEmailMismatchError(code, invitation.email));
        }

        return okAsync(invitation);
      });
    },

    acceptInvitation(
      command: AcceptInvitationCommand
    ): ResultAsync<Invitation, InvitationServiceError> {
      const { code, userId } = command;

      return invitationStore.findByCode(code).andThen((invitation) => {
        if (!invitation) {
          return errAsync(invitationNotFoundError({ code }));
        }

        const currentTime = clock.now().toISOString();

        // Check if expired
        if (isInvitationExpired(invitation, currentTime)) {
          return errAsync(invitationExpiredError(code, invitation.expiresAt));
        }

        // Check if already accepted
        if (isInvitationAccepted(invitation)) {
          return errAsync(invitationAlreadyAcceptedError(code, invitation.acceptedAt!));
        }

        // Mark as accepted
        const accepted: Invitation = {
          ...invitation,
          acceptedAt: currentTime,
          acceptedByUserId: userId,
        };

        return invitationStore.save(accepted).map(() => accepted);
      });
    },

    listPendingInvitations(
      query: ListPendingInvitationsQuery
    ): ResultAsync<Invitation[], InvitationServiceError> {
      const currentTime = clock.now().toISOString();
      return invitationStore.findPendingByOrganization(query.organizationId, currentTime);
    },
  };
};
