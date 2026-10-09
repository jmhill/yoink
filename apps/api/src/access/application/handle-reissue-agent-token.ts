import { errAsync, type ResultAsync } from 'neverthrow';
import type { User } from '../domain/user.js';
import { principalKindOf } from '../domain/user.js';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { ApiToken } from '../domain/api-token.js';
import type { ReissueAgentTokenCommand } from '../domain/token-commands.js';
import type { TokenCreated, TokenRevoked } from '../domain/token-events.js';
import { decideReissueAgentToken } from '../domain/decide-reissue-agent-token.js';
import { applyTokenEvent } from '../domain/apply-token-event.js';
import { tokenStorageError, type TokenStorageError } from '../domain/auth-errors.js';
import type { TokenInfo } from '../domain/token-info.js';
import type { DecideReissueAgentTokenError } from '../domain/decide-reissue-agent-token.js';
import type { TokenWriteError } from '../domain/token-store.js';
import type { UserServiceError } from '../domain/user-errors.js';
import type { MembershipServiceError } from '../domain/organization-errors.js';

export type LoadMembership = (
  userId: string,
  organizationId: string
) => ResultAsync<OrganizationMembership | null, MembershipServiceError>;

export type LoadUser = (userId: string) => ResultAsync<User | null, UserServiceError>;

export type ListMemberTokens = (
  userId: string,
  organizationId: string
) => ResultAsync<ApiToken[], TokenStorageError>;

export type PersistReissue = (input: {
  revoke: TokenRevoked[];
  create: TokenCreated;
  tokenHash: string;
}) => ResultAsync<void, TokenWriteError>;

export type HashSecret = (secret: string) => ResultAsync<string, TokenStorageError>;

export type HandleReissueAgentTokenDeps = {
  loadMembership: LoadMembership;
  loadUser: LoadUser;
  listMemberTokens: ListMemberTokens;
  persistReissue: PersistReissue;
  hashSecret: HashSecret;
  nextId: () => string;
  nextSecret: () => string;
  now: () => string;
};

export type ReissueAgentTokenResult = {
  token: TokenInfo;
  rawToken: string;
};

export type ReissueAgentTokenError =
  | DecideReissueAgentTokenError
  | MembershipServiceError
  | UserServiceError
  | TokenWriteError;

export const handleReissueAgentToken = (
  command: ReissueAgentTokenCommand,
  deps: HandleReissueAgentTokenDeps
): ResultAsync<ReissueAgentTokenResult, ReissueAgentTokenError> => {
  const actorUserId = command.actor.userId;

  return deps
    .loadMembership(actorUserId, command.organizationId)
    .andThen((actorMembership) =>
      deps.loadMembership(command.memberUserId, command.organizationId).andThen((targetMembership) =>
        deps.loadUser(command.memberUserId).andThen((targetUser) =>
          deps.listMemberTokens(command.memberUserId, command.organizationId).andThen((activeTokens) => {
            const decision = decideReissueAgentToken({
              command,
              actorRole: actorMembership?.role ?? null,
              targetMembership: targetMembership
                ? { userId: targetMembership.userId, organizationId: targetMembership.organizationId }
                : null,
              targetKind: targetUser ? principalKindOf(targetUser) : null,
              activeTokens,
              tokenName: targetUser?.name ?? 'agent',
              newTokenId: deps.nextId(),
              now: deps.now(),
            });

            if (decision.isErr()) {
              return errAsync(decision.error);
            }

            const { revoke, create } = decision.value;
            const projected = applyTokenEvent(null, create);
            if (!projected) {
              return errAsync(tokenStorageError('Reissue did not project a token'));
            }

            const secret = deps.nextSecret();
            return deps.hashSecret(secret).andThen((tokenHash) =>
              deps.persistReissue({ revoke, create, tokenHash }).map(() => ({
                token: projected,
                rawToken: `${create.id}:${secret}`,
              }))
            );
          })
        )
      )
    );
};
