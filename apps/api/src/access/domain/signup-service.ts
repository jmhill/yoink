import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { Invitation, InvitationRole } from './invitation.js';
import type { InvitationStore } from './invitation-store.js';
import type { Organization } from './organization.js';
import type { OrganizationStore } from './organization-store.js';
import type { OrganizationMembershipStore } from './organization-membership-store.js';
import type { UserStore } from './user-store.js';
import type { SignupStore } from './signup-store.js';
import { decideAcceptInvitation } from './decide-accept-invitation.js';
import {
  acceptInvitationFailedError,
  type AcceptInvitationFailedError,
  type AlreadyMemberOfOrgError,
  type InvitationAlreadyAcceptedError,
  type InvitationEmailMismatchError,
  type InvitationExpiredError,
  type InvitationNotFoundError,
  type InvitationReplacedError,
  type InvitationStorageError,
  type WorkspaceAlreadyHasOwnerError,
} from './invitation-errors.js';
import { normalizeEmail } from '@yoink/api-contracts';

export type SignupInvitationNotFoundError = InvitationNotFoundError;
export type SignupInvitationExpiredError = InvitationExpiredError;
export type SignupInvitationAlreadyAcceptedError = InvitationAlreadyAcceptedError;
export type SignupInvitationEmailMismatchError = InvitationEmailMismatchError;

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
  | InvitationNotFoundError
  | InvitationExpiredError
  | InvitationAlreadyAcceptedError
  | InvitationReplacedError
  | InvitationEmailMismatchError
  | WorkspaceAlreadyHasOwnerError
  | AlreadyMemberOfOrgError
  | SignupEmailAlreadyRegisteredError
  | SignupOrganizationNotFoundError
  | AcceptInvitationFailedError
  | SignupStorageError
  | InvitationStorageError;

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

export type SignupService = {
  validateSignupRequest(
    query: ValidateSignupRequestQuery
  ): ResultAsync<ValidateSignupResult, SignupServiceError>;

  completeSignup(
    command: CompleteSignupCommand
  ): ResultAsync<CompleteSignupResult, SignupServiceError>;
};

export type SignupServiceDependencies = {
  invitationStore: InvitationStore;
  userStore: UserStore;
  organizationStore: OrganizationStore;
  membershipStore: OrganizationMembershipStore;
  signupStore: SignupStore;
  clock: Clock;
  idGenerator: IdGenerator;
};

export const createSignupService = (deps: SignupServiceDependencies): SignupService => {
  const {
    invitationStore,
    userStore,
    organizationStore,
    membershipStore,
    signupStore,
    clock,
    idGenerator,
  } = deps;

  const loadInvitationContext = (
    code: string,
    email: string,
    userId: string
  ): ResultAsync<{ invitation: Invitation; organization: Organization }, SignupServiceError> => {
    return invitationStore
      .findByCode(code)
      .mapErr((error) => storageError('Failed to find invitation', error))
      .andThen((invitation) => {
        if (!invitation) {
          return errAsync({ type: 'INVITATION_NOT_FOUND' as const, code });
        }
        return membershipStore
          .findByOrganizationId(invitation.organizationId)
          .mapErr((error) => storageError('Failed to load members', error))
          .andThen((members) => {
            const decision = decideAcceptInvitation({
              command: { code, account: { userId, email } },
              invitation,
              members,
              now: clock.now().toISOString(),
              eventId: idGenerator.generate(),
              membershipId: idGenerator.generate(),
            });
            if (decision.isErr()) {
              return errAsync(decision.error);
            }
            return userStore
              .findByNormalizedEmail(normalizeEmail(email))
              .mapErr((error) => storageError('Failed to check email availability', error))
              .andThen((existingUser) => {
                if (existingUser) {
                  return errAsync(emailAlreadyRegisteredError(email));
                }
                return organizationStore
                  .findById(invitation.organizationId)
                  .mapErr((error) => storageError('Failed to get organization', error))
                  .andThen((organization) => {
                    if (!organization) {
                      return errAsync(organizationNotFoundError(invitation.organizationId));
                    }
                    return okAsync({ invitation, organization });
                  });
              });
          });
      });
  };

  return {
    validateSignupRequest(
      query: ValidateSignupRequestQuery
    ): ResultAsync<ValidateSignupResult, SignupServiceError> {
      return loadInvitationContext(query.code, query.email, idGenerator.generate());
    },

    completeSignup(
      command: CompleteSignupCommand
    ): ResultAsync<CompleteSignupResult, SignupServiceError> {
      const { code, email } = command;
      const now = clock.now().toISOString();
      const userId = idGenerator.generate();
      const personalOrgId = idGenerator.generate();
      const personalOrgName = `${email}'s Workspace`;
      const personalMembershipId = idGenerator.generate();
      const invitedMembershipId = idGenerator.generate();
      const eventId = idGenerator.generate();

      return invitationStore
        .findByCode(code)
        .mapErr((error) => storageError('Failed to find invitation', error))
        .andThen((invitation) => {
          if (!invitation) {
            return errAsync({ type: 'INVITATION_NOT_FOUND' as const, code });
          }
          return membershipStore
            .findByOrganizationId(invitation.organizationId)
            .mapErr((error) => storageError('Failed to load members', error))
            .andThen((members) => {
              const decision = decideAcceptInvitation({
                command: { code, account: { userId, email } },
                invitation,
                members,
                now,
                eventId,
                membershipId: invitedMembershipId,
              });
              if (decision.isErr()) {
                return errAsync(decision.error);
              }
              return userStore
                .findByNormalizedEmail(normalizeEmail(email))
                .mapErr((error) => storageError('Failed to check email availability', error))
                .andThen((existingUser) => {
                  if (existingUser) {
                    return errAsync(emailAlreadyRegisteredError(email));
                  }
                  return organizationStore
                    .findById(invitation.organizationId)
                    .mapErr((error) => storageError('Failed to get organization', error))
                    .andThen((organization) => {
                      if (!organization) {
                        return errAsync(organizationNotFoundError(invitation.organizationId));
                      }
                      const user = { id: userId, email, createdAt: now };
                      const personalOrg = {
                        id: personalOrgId,
                        name: personalOrgName,
                        createdAt: now,
                      };
                      const personalMembership = {
                        id: personalMembershipId,
                        userId,
                        organizationId: personalOrgId,
                        role: 'owner' as const,
                        isPersonalOrg: true,
                        joinedAt: now,
                      };
                      return signupStore
                        .completeSignup({
                          user,
                          personalOrganization: personalOrg,
                          personalMembership,
                          invitedMembership: decision.value.membership.membership,
                          accepted: decision.value.accepted,
                          event: decision.value.event,
                        })
                        .mapErr((error) =>
                          acceptInvitationFailedError(error.cause ?? error)
                        )
                        .map(
                          (): CompleteSignupResult => ({
                            user: { id: userId, email },
                            personalOrganization: {
                              id: personalOrgId,
                              name: personalOrgName,
                            },
                            invitedOrganization: {
                              id: invitation.organizationId,
                              name: organization.name,
                              role: invitation.role,
                            },
                          })
                        );
                    });
                });
            });
        });
    },
  };
};
