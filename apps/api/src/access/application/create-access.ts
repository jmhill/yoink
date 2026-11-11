import { memberDisplayName } from '@yoink/api-contracts';
import type { Clock } from '../../kernel/clock.js';
import type { IdGenerator } from '../../kernel/id-generator.js';
import type { ResultAsync } from 'neverthrow';
import type { UnitOfWork } from '../../kernel/unit-of-work.js';
import type { InvitationStore } from '../domain/invitation-store.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import type { OrganizationStore } from '../domain/organization-store.js';
import type { SessionService } from './handle-session.js';
import type { SignupService } from './handle-signup.js';
import type { TokenService } from './handle-token.js';
import type { UserStore } from '../domain/user-store.js';
import type {
  AccessStorageError,
  ActorName,
  AuthenticateSession,
  AuthenticateToken,
  CompletedSignup,
  CompleteSignupError,
  FirstHuman,
  RecordSessionActivity,
  UserDisplayName,
} from './access-types.js';
import {
  authenticateSessionWith,
  authenticateTokenWith,
  idleActivity,
  idleSession,
  recordSessionActivityWith,
} from './authenticate-principal.js';
import type { CompleteSignupInput } from './handle-signup.js';

export type LoadOrganizationTimeZone = (
  organizationId: string
) => ResultAsync<string | null, AccessStorageError>;

export type LoadFirstHuman = (
  organizationId: string
) => ResultAsync<FirstHuman | null, AccessStorageError>;

export type LoadNamedAgent = (input: {
  readonly organizationId: string;
  readonly name: string;
}) => ResultAsync<string | null, AccessStorageError>;

export type LoadActorNames = (
  userIds: readonly string[]
) => ResultAsync<readonly ActorName[], AccessStorageError>;

export type AccessDependencies = {
  readonly tokenService: TokenService;
  readonly sessionService: SessionService | null;
  readonly userStore: UserStore;
  readonly membershipStore: OrganizationMembershipStore;
  readonly invitationStore: InvitationStore;
  readonly organizationStore: OrganizationStore;
  readonly loadOrganizationTimeZone: LoadOrganizationTimeZone;
  readonly loadFirstHuman: LoadFirstHuman;
  readonly loadNamedAgent: LoadNamedAgent;
  readonly loadActorNames: LoadActorNames;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly unitOfWork: UnitOfWork;
  readonly signupService: Pick<SignupService, 'completeSignup'>;
};

export type Access = {
  readonly commands: {
    readonly completeSignup: (
      input: CompleteSignupInput
    ) => ResultAsync<CompletedSignup, CompleteSignupError>;
    readonly recordSessionActivity: RecordSessionActivity;
  };
  readonly queries: {
    readonly authenticateToken: AuthenticateToken;
    readonly authenticateSession: AuthenticateSession;
    readonly organizationTimeZone: LoadOrganizationTimeZone;
    readonly principalExistsInOrganization: (input: {
      readonly userId: string;
      readonly organizationId: string;
    }) => ResultAsync<boolean, AccessStorageError>;
    readonly memberIds: (
      organizationId: string
    ) => ResultAsync<readonly string[], AccessStorageError>;
    readonly userDisplayNames: (
      userIds: readonly string[]
    ) => ResultAsync<readonly UserDisplayName[], AccessStorageError>;
    readonly actorNames: LoadActorNames;
    readonly firstHuman: LoadFirstHuman;
    readonly namedAgent: LoadNamedAgent;
  };
  readonly prepare: Record<string, never>;
};

const storage = (message: string): AccessStorageError => ({
  type: 'ACCESS_STORAGE',
  message,
});

export const createAccess = (deps: AccessDependencies): Access => {
  const authenticateSession =
    deps.sessionService === null
      ? idleSession()
      : authenticateSessionWith(deps.sessionService);
  const recordSessionActivity =
    deps.sessionService === null
      ? idleActivity()
      : recordSessionActivityWith(deps.sessionService);

  return {
    commands: {
      completeSignup: (input) => deps.signupService.completeSignup(input),
      recordSessionActivity,
    },
    queries: {
      authenticateToken: authenticateTokenWith(deps.tokenService),
      authenticateSession,
      organizationTimeZone: deps.loadOrganizationTimeZone,
      principalExistsInOrganization: ({ userId, organizationId }) =>
        deps.membershipStore
          .findByUserAndOrg(userId, organizationId)
          .map((membership) => membership !== null)
          .mapErr((error) => storage(error.message)),
      memberIds: (organizationId) =>
        deps.membershipStore
          .findByOrganizationId(organizationId)
          .map((memberships) => memberships.map((membership) => membership.userId))
          .mapErr((error) => storage(error.message)),
      userDisplayNames: (userIds) =>
        deps.userStore
          .findByIds([...userIds])
          .map((users) =>
            users.map((user) => ({
              id: user.id,
              displayName: memberDisplayName({ email: user.email, name: user.name }),
            }))
          )
          .mapErr((error) => storage(error.message)),
      actorNames: deps.loadActorNames,
      firstHuman: deps.loadFirstHuman,
      namedAgent: deps.loadNamedAgent,
    },
    prepare: {},
  };
};
