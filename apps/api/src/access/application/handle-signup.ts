import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import { normalizeEmail } from '../domain/email.js';
import type { Clock } from '../../kernel/clock.js';
import type { IdGenerator } from '../../kernel/id-generator.js';
import type { UnitOfWork } from '../../kernel/unit-of-work.js';
import type { PasskeyServiceError } from '../domain/auth-errors.js';
import { decideAcceptInvitation } from '../domain/decide-accept-invitation.js';
import {
  decideInvitationLoaded,
  decideSignupEmail,
  decideSignupOrganization,
  signupContextFrom,
  signupRecords,
  type SignupContext,
} from '../domain/decide-signup.js';
import type { InvitationStore } from '../domain/invitation-store.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import type { OrganizationStore } from '../domain/organization-store.js';
import type { PasskeyCredential } from '../domain/passkey-credential.js';
import type { VerifyRegistrationParams } from '../domain/passkey-commands.js';
import {
  emailAlreadyRegisteredError,
  signupStorageError,
  type SignupServiceError,
  type ValidateSignupRequestQuery,
  type ValidateSignupResult,
} from '../domain/signup-commands.js';
import type { SignupPlan } from '../domain/signup-plan.js';
import type { UserSession } from '../domain/user-session.js';
import type { UserStore } from '../domain/user-store.js';
import type { CompletedSignup, CompleteSignupError, PasskeyRegistrationFailed } from './access-types.js';

export type VerifySignupCredential = (input: {
  readonly userId: string;
  readonly challenge: string;
  readonly response: VerifyRegistrationParams['response'];
  readonly credentialName?: string;
}) => ResultAsync<PasskeyCredential, PasskeyServiceError>;

export type CompleteSignupInput = {
  readonly code: string;
  readonly email: string;
  readonly challenge: string;
  readonly credential: VerifyRegistrationParams['response'];
  readonly credentialName?: string;
};

export type SignupService = {
  validateSignupRequest(
    query: ValidateSignupRequestQuery
  ): ResultAsync<ValidateSignupResult, SignupServiceError>;
  completeSignup(
    input: CompleteSignupInput
  ): ResultAsync<CompletedSignup, CompleteSignupError>;
};

export type SignupServiceDependencies = {
  invitationStore: InvitationStore;
  userStore: UserStore;
  organizationStore: OrganizationStore;
  membershipStore: OrganizationMembershipStore;
  clock: Clock;
  idGenerator: IdGenerator;
  /**
   * The composition root passes the sqlite unit of work. Complete signup
   * commits the existing signup plan through it. Validate does not write.
   */
  unitOfWork: UnitOfWork;
  verifySignupCredential: VerifySignupCredential | null;
  sessionTtlMs: number;
};

const passkeyFailed = (): PasskeyRegistrationFailed => ({
  type: 'PASSKEY_REGISTRATION_FAILED',
});

const readSignupContext = (
  deps: SignupServiceDependencies,
  input: {
    code: string;
    email: string;
    userId: string;
    atDecision: () => { now: string; eventId: string; invitedMembershipId: string };
  }
): ResultAsync<SignupContext, SignupServiceError> =>
  deps.invitationStore
    .findByCode(input.code)
    .mapErr((error) => signupStorageError('Failed to find invitation', error))
    .andThen((invitation) => {
      const loaded = decideInvitationLoaded(invitation, input.code);
      if (loaded.isErr()) {
        return errAsync(loaded.error);
      }
      return deps.membershipStore
        .findByOrganizationId(loaded.value.organizationId)
        .mapErr((error) => signupStorageError('Failed to load members', error))
        .andThen((members) => {
          const { now, eventId, invitedMembershipId } = input.atDecision();
          const accepted = decideAcceptInvitation({
            command: {
              code: input.code,
              account: { userId: input.userId, email: input.email },
            },
            invitation: loaded.value,
            members,
            now,
            eventId,
            membershipId: invitedMembershipId,
          });
          if (accepted.isErr()) {
            return errAsync(accepted.error);
          }
          return deps.userStore
            .findByNormalizedEmail(normalizeEmail(input.email))
            .mapErr((error) => signupStorageError('Failed to check email availability', error))
            .andThen((existingUser) => {
              const emailDecision = decideSignupEmail(input.email, existingUser);
              if (emailDecision.isErr()) {
                return errAsync(emailDecision.error);
              }
              return deps.organizationStore
                .findById(loaded.value.organizationId)
                .mapErr((error) => signupStorageError('Failed to get organization', error))
                .andThen((organization) => {
                  const orgDecision = decideSignupOrganization(
                    organization,
                    loaded.value.organizationId
                  );
                  if (orgDecision.isErr()) {
                    return errAsync(orgDecision.error);
                  }
                  return okAsync(
                    signupContextFrom(loaded.value, orgDecision.value, accepted.value)
                  );
                });
            });
        });
    });

/**
 * Reads and WebAuthn verify finish before the batch. The batch is one
 * `commit` of the existing signup plan. A conflict is the guarded email
 * insert. It is not run again. `planRegistrationCredential` does not write.
 */
export const completeSignup = (
  input: CompleteSignupInput,
  deps: SignupServiceDependencies
): ResultAsync<CompletedSignup, CompleteSignupError> => {
  const now = deps.clock.now().toISOString();
  const userId = deps.idGenerator.generate();
  const personalOrgId = deps.idGenerator.generate();
  const personalMembershipId = deps.idGenerator.generate();
  const invitedMembershipId = deps.idGenerator.generate();
  const eventId = deps.idGenerator.generate();

  return readSignupContext(deps, {
    code: input.code,
    email: input.email,
    userId,
    atDecision: () => ({ now, eventId, invitedMembershipId }),
  }).andThen((context) => {
    if (deps.verifySignupCredential === null) {
      return errAsync(passkeyFailed());
    }
    return deps
      .verifySignupCredential({
        userId,
        challenge: input.challenge,
        response: input.credential,
        ...(input.credentialName === undefined
          ? {}
          : { credentialName: input.credentialName }),
      })
      .mapErr(() => passkeyFailed())
      .andThen((credential) => {
        const records = signupRecords({
          email: input.email,
          userId,
          personalOrgId,
          personalMembershipId,
          now,
          context,
        });
        const sessionNow = deps.clock.now();
        const session: UserSession = {
          id: deps.idGenerator.generate(),
          userId,
          currentOrganizationId: personalOrgId,
          createdAt: sessionNow.toISOString(),
          expiresAt: new Date(sessionNow.getTime() + deps.sessionTtlMs).toISOString(),
          lastActiveAt: sessionNow.toISOString(),
        };
        const plan: SignupPlan = {
          ...records,
          credential,
          session,
        };
        const completed: CompletedSignup = {
          user: { id: userId, email: input.email },
          personalOrganization: {
            id: records.personalOrganization.id,
            name: records.personalOrganization.name,
          },
          invitedOrganization: {
            id: context.invitation.organizationId,
            name: context.organization.name,
            role: context.invitation.role,
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
              return emailAlreadyRegisteredError(input.email);
            }
            return signupStorageError('Failed to complete signup', failure);
          });
      });
  });
};

/**
 * Validate decides from the code, the email, and the invitation, member,
 * user, and organization queries. It does not write. Complete signup uses
 * that decision, then verify, then one commit of the existing signup plan.
 */
export const createSignupService = (deps: SignupServiceDependencies): SignupService => ({
  validateSignupRequest(query) {
    const userId = deps.idGenerator.generate();
    return readSignupContext(deps, {
      code: query.code,
      email: query.email,
      userId,
      atDecision: () => ({
        now: deps.clock.now().toISOString(),
        eventId: deps.idGenerator.generate(),
        invitedMembershipId: deps.idGenerator.generate(),
      }),
    }).map(({ invitation, organization }) => ({ invitation, organization }));
  },

  completeSignup(input) {
    return completeSignup(input, deps);
  },
});
