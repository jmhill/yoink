import { errAsync, type ResultAsync } from 'neverthrow';
import { normalizeEmail } from '@yoink/api-contracts';
import type { Clock } from '../../kernel/clock.js';
import type { IdGenerator } from '../../kernel/id-generator.js';
import type { UnitOfWork } from '../../kernel/unit-of-work.js';
import type { PasskeyServiceError } from '../domain/auth-errors.js';
import { decideAcceptInvitation } from '../domain/decide-accept-invitation.js';
import type { InvitationStore } from '../domain/invitation-store.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import type { OrganizationStore } from '../domain/organization-store.js';
import type { PasskeyCredential } from '../domain/passkey-credential.js';
import type { VerifyRegistrationParams } from '../domain/passkey-commands.js';
import type { SignupPlan } from '../domain/signup-plan.js';
import type {
  SignupEmailAlreadyRegisteredError,
  SignupOrganizationNotFoundError,
  SignupStorageError,
} from '../domain/signup-service.js';
import type { UserSession } from '../domain/user-session.js';
import type { UserStore } from '../domain/user-store.js';
import type { CompletedSignup, CompleteSignupError, PasskeyRegistrationFailed } from './access-types.js';

export type VerifySignupCredential = (input: {
  readonly userId: string;
  readonly challenge: string;
  readonly response: VerifyRegistrationParams['response'];
  readonly credentialName?: string;
}) => ResultAsync<PasskeyCredential, PasskeyServiceError>;

export type CompleteSignupDependencies = {
  readonly invitationStore: InvitationStore;
  readonly userStore: UserStore;
  readonly organizationStore: OrganizationStore;
  readonly membershipStore: OrganizationMembershipStore;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly unitOfWork: UnitOfWork;
  readonly verifySignupCredential: VerifySignupCredential | null;
  readonly sessionTtlMs: number;
};

export type CompleteSignupInput = {
  readonly code: string;
  readonly email: string;
  readonly challenge: string;
  readonly credential: VerifyRegistrationParams['response'];
  readonly credentialName?: string;
};

const emailTaken = (email: string): SignupEmailAlreadyRegisteredError => ({
  type: 'EMAIL_ALREADY_REGISTERED',
  email,
});

const organizationMissing = (
  organizationId: string
): SignupOrganizationNotFoundError => ({
  type: 'ORGANIZATION_NOT_FOUND',
  organizationId,
});

const storageError = (message: string, cause?: unknown): SignupStorageError => ({
  type: 'SIGNUP_STORAGE_ERROR',
  message,
  cause,
});

const passkeyFailed = (): PasskeyRegistrationFailed => ({
  type: 'PASSKEY_REGISTRATION_FAILED',
});

/**
 * Reads and WebAuthn verify finish before the batch. The batch is one
 * `commit`. A conflict is the guarded email insert. It is not run again.
 */
export const completeSignup = (
  input: CompleteSignupInput,
  deps: CompleteSignupDependencies
): ResultAsync<CompletedSignup, CompleteSignupError> => {
  const now = deps.clock.now().toISOString();
  const userId = deps.idGenerator.generate();
  const personalOrgId = deps.idGenerator.generate();
  const personalMembershipId = deps.idGenerator.generate();
  const invitedMembershipId = deps.idGenerator.generate();
  const eventId = deps.idGenerator.generate();
  const personalOrgName = `${input.email}'s Workspace`;

  return deps.invitationStore
    .findByCode(input.code)
    .mapErr((error) => storageError('Failed to find invitation', error))
    .andThen((invitation) => {
      if (!invitation) {
        return errAsync({ type: 'INVITATION_NOT_FOUND' as const, code: input.code });
      }
      return deps.membershipStore
        .findByOrganizationId(invitation.organizationId)
        .mapErr((error) => storageError('Failed to load members', error))
        .andThen((members) => {
          const decision = decideAcceptInvitation({
            command: { code: input.code, account: { userId, email: input.email } },
            invitation,
            members,
            now,
            eventId,
            membershipId: invitedMembershipId,
          });
          if (decision.isErr()) {
            return errAsync(decision.error);
          }
          return deps.userStore
            .findByNormalizedEmail(normalizeEmail(input.email))
            .mapErr((error) => storageError('Failed to check email availability', error))
            .andThen((existingUser) => {
              if (existingUser) {
                return errAsync(emailTaken(input.email));
              }
              return deps.organizationStore
                .findById(invitation.organizationId)
                .mapErr((error) => storageError('Failed to get organization', error))
                .andThen((organization) => {
                  if (!organization) {
                    return errAsync(organizationMissing(invitation.organizationId));
                  }
                  if (deps.verifySignupCredential === null) {
                    return errAsync(passkeyFailed());
                  }
                  return deps.verifySignupCredential({
                    userId,
                    challenge: input.challenge,
                    response: input.credential,
                    ...(input.credentialName === undefined
                      ? {}
                      : { credentialName: input.credentialName }),
                  })
                    .mapErr(() => passkeyFailed())
                    .andThen((credential) => {
                      const sessionNow = deps.clock.now();
                      const session: UserSession = {
                        id: deps.idGenerator.generate(),
                        userId,
                        currentOrganizationId: personalOrgId,
                        createdAt: sessionNow.toISOString(),
                        expiresAt: new Date(
                          sessionNow.getTime() + deps.sessionTtlMs
                        ).toISOString(),
                        lastActiveAt: sessionNow.toISOString(),
                      };
                      const plan: SignupPlan = {
                        user: { id: userId, email: input.email, createdAt: now },
                        personalOrganization: {
                          id: personalOrgId,
                          name: personalOrgName,
                          createdAt: now,
                        },
                        personalMembership: {
                          id: personalMembershipId,
                          userId,
                          organizationId: personalOrgId,
                          role: 'owner',
                          isPersonalOrg: true,
                          joinedAt: now,
                        },
                        invitedMembership: decision.value.membership.membership,
                        accepted: decision.value.accepted,
                        event: decision.value.event,
                        credential,
                        session,
                      };
                      const completed: CompletedSignup = {
                        user: { id: userId, email: input.email },
                        personalOrganization: {
                          id: personalOrgId,
                          name: personalOrgName,
                        },
                        invitedOrganization: {
                          id: invitation.organizationId,
                          name: organization.name,
                          role: invitation.role,
                        },
                        sessionId: session.id,
                      };
                      return deps.unitOfWork
                        .commit([
                          {
                            result: completed,
                            events: [],
                            step: { owner: 'access', plan },
                          },
                        ])
                        .map(() => completed)
                        .mapErr((failure): CompleteSignupError => {
                          if (failure.kind === 'Conflict') {
                            return emailTaken(input.email);
                          }
                          return storageError('Failed to complete signup', failure);
                        });
                    });
                });
            });
        });
    });
};
