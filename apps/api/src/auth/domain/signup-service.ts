import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { Invitation, InvitationRole } from '../../organizations/domain/invitation.js';
import type { InvitationStore } from '../../organizations/domain/invitation-store.js';
import type { Organization } from '../../organizations/domain/organization.js';
import type { OrganizationStore } from '../../organizations/domain/organization-store.js';
import type { OrganizationMembershipStore } from '../../organizations/domain/organization-membership-store.js';
import type { UserStore } from '../../users/domain/user-store.js';
import { isInvitationExpired, isInvitationAccepted } from '../../organizations/domain/invitation.js';

// ============================================================================
// Error Types
// ============================================================================

export type SignupInvitationNotFoundError = {
  type: 'INVITATION_NOT_FOUND';
  code: string;
};

export type SignupInvitationExpiredError = {
  type: 'INVITATION_EXPIRED';
  code: string;
  expiresAt: string;
};

export type SignupInvitationAlreadyAcceptedError = {
  type: 'INVITATION_ALREADY_ACCEPTED';
  code: string;
  acceptedAt: string;
};

export type SignupInvitationEmailMismatchError = {
  type: 'INVITATION_EMAIL_MISMATCH';
  code: string;
  expectedEmail: string;
};

export type SignupEmailAlreadyRegisteredError = {
  type: 'EMAIL_ALREADY_REGISTERED';
  email: string;
};

export type SignupOrganizationNotFoundError = {
  type: 'ORGANIZATION_NOT_FOUND';
  organizationId: string;
};

export type SignupStorageError = {
  type: 'SIGNUP_STORAGE_ERROR';
  message: string;
  cause?: unknown;
};

export type SignupServiceError =
  | SignupInvitationNotFoundError
  | SignupInvitationExpiredError
  | SignupInvitationAlreadyAcceptedError
  | SignupInvitationEmailMismatchError
  | SignupEmailAlreadyRegisteredError
  | SignupOrganizationNotFoundError
  | SignupStorageError;

// Error constructors
const invitationNotFoundError = (code: string): SignupInvitationNotFoundError => ({
  type: 'INVITATION_NOT_FOUND',
  code,
});

const invitationExpiredError = (code: string, expiresAt: string): SignupInvitationExpiredError => ({
  type: 'INVITATION_EXPIRED',
  code,
  expiresAt,
});

const invitationAlreadyAcceptedError = (code: string, acceptedAt: string): SignupInvitationAlreadyAcceptedError => ({
  type: 'INVITATION_ALREADY_ACCEPTED',
  code,
  acceptedAt,
});

const invitationEmailMismatchError = (code: string, expectedEmail: string): SignupInvitationEmailMismatchError => ({
  type: 'INVITATION_EMAIL_MISMATCH',
  code,
  expectedEmail,
});

const emailAlreadyRegisteredError = (email: string): SignupEmailAlreadyRegisteredError => ({
  type: 'EMAIL_ALREADY_REGISTERED',
  email,
});

const organizationNotFoundError = (organizationId: string): SignupOrganizationNotFoundError => ({
  type: 'ORGANIZATION_NOT_FOUND',
  organizationId,
});

const storageError = (message: string, cause?: unknown): SignupStorageError => ({
  type: 'SIGNUP_STORAGE_ERROR',
  message,
  cause,
});

// ============================================================================
// Commands and Queries
// ============================================================================

export type ValidateSignupRequestQuery = {
  code: string;
  email: string;
};

export type ValidateSignupResult = {
  invitation: Invitation;
  organization: Organization;
};

export type CompleteSignupCommand = {
  code: string;
  email: string;
};

export type CompleteSignupResult = {
  user: {
    id: string;
    email: string;
  };
  personalOrganization: {
    id: string;
    name: string;
  };
  invitedOrganization: {
    id: string;
    name: string;
    role: InvitationRole;
  };
};

// ============================================================================
// Service Interface
// ============================================================================

export type SignupService = {
  /**
   * Validate a signup request.
   * Checks invitation validity, email match, and that email is not already registered.
   */
  validateSignupRequest(
    query: ValidateSignupRequestQuery
  ): ResultAsync<ValidateSignupResult, SignupServiceError>;

  /**
   * Complete signup process.
   * Creates user, personal organization, and memberships.
   * Marks invitation as accepted.
   */
  completeSignup(
    command: CompleteSignupCommand
  ): ResultAsync<CompleteSignupResult, SignupServiceError>;
};

// ============================================================================
// Dependencies
// ============================================================================

export type SignupServiceDependencies = {
  invitationStore: InvitationStore;
  userStore: UserStore;
  organizationStore: OrganizationStore;
  membershipStore: OrganizationMembershipStore;
  clock: Clock;
  idGenerator: IdGenerator;
};

// ============================================================================
// Implementation
// ============================================================================

export const createSignupService = (deps: SignupServiceDependencies): SignupService => {
  const { invitationStore, userStore, organizationStore, membershipStore, clock, idGenerator } = deps;

  /**
   * Internal helper to validate invitation and check email availability
   */
  const validateInvitationAndEmail = (
    code: string,
    email: string
  ): ResultAsync<{ invitation: Invitation; organization: Organization }, SignupServiceError> => {
    return invitationStore
      .findByCode(code)
      .mapErr((e) => storageError('Failed to find invitation', e))
      .andThen((invitation) => {
        if (!invitation) {
          return errAsync(invitationNotFoundError(code));
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

        // Check email match (if invitation has email restriction)
        if (invitation.email && invitation.email !== email) {
          return errAsync(invitationEmailMismatchError(code, invitation.email));
        }

        // Check if email is already registered
        return userStore
          .findByEmail(email)
          .mapErr((e) => storageError('Failed to check email availability', e))
          .andThen((existingUser) => {
            if (existingUser) {
              return errAsync(emailAlreadyRegisteredError(email));
            }

            // Get the organization
            return organizationStore
              .findById(invitation.organizationId)
              .mapErr((e) => storageError('Failed to get organization', e))
              .andThen((organization) => {
                if (!organization) {
                  return errAsync(organizationNotFoundError(invitation.organizationId));
                }

                return okAsync({ invitation, organization });
              });
          });
      });
  };

  return {
    validateSignupRequest(
      query: ValidateSignupRequestQuery
    ): ResultAsync<ValidateSignupResult, SignupServiceError> {
      return validateInvitationAndEmail(query.code, query.email);
    },

    completeSignup(
      command: CompleteSignupCommand
    ): ResultAsync<CompleteSignupResult, SignupServiceError> {
      const { code, email } = command;

      return validateInvitationAndEmail(code, email).andThen(({ invitation, organization }) => {
        const now = clock.now().toISOString();
        const userId = idGenerator.generate();
        const personalOrgId = idGenerator.generate();
        const personalOrgName = `${email}'s Workspace`;

        // Create user
        const user = {
          id: userId,
          organizationId: personalOrgId, // Primary org is personal org
          email,
          createdAt: now,
        };

        // Create personal organization
        const personalOrg = {
          id: personalOrgId,
          name: personalOrgName,
          createdAt: now,
        };

        // Create personal org membership (owner)
        const personalMembership = {
          id: idGenerator.generate(),
          userId,
          organizationId: personalOrgId,
          role: 'owner' as const,
          isPersonalOrg: true,
          joinedAt: now,
        };

        // Create invited org membership
        const invitedMembership = {
          id: idGenerator.generate(),
          userId,
          organizationId: invitation.organizationId,
          role: invitation.role,
          isPersonalOrg: false,
          joinedAt: now,
        };

        // Mark invitation as accepted
        const acceptedInvitation: Invitation = {
          ...invitation,
          acceptedAt: now,
          acceptedByUserId: userId,
        };

        // Save all entities, mapping storage errors to signup errors
        return organizationStore
          .save(personalOrg)
          .mapErr((e) => storageError('Failed to create personal organization', e))
          .andThen(() => userStore.save(user).mapErr((e) => storageError('Failed to create user', e)))
          .andThen(() => membershipStore.save(personalMembership).mapErr((e) => storageError('Failed to create personal membership', e)))
          .andThen(() => membershipStore.save(invitedMembership).mapErr((e) => storageError('Failed to create invited membership', e)))
          .andThen(() => invitationStore.save(acceptedInvitation).mapErr((e) => storageError('Failed to accept invitation', e)))
          .map((): CompleteSignupResult => ({
            user: {
              id: userId,
              email,
            },
            personalOrganization: {
              id: personalOrgId,
              name: personalOrgName,
            },
            invitedOrganization: {
              id: invitation.organizationId,
              name: organization.name,
              role: invitation.role,
            },
          }));
      });
    },
  };
};
