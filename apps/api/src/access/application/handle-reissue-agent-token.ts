import { errAsync, type ResultAsync } from 'neverthrow';
import type { User } from '../domain/user.js';
import { principalKindOf } from '../domain/user.js';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { ReissueAgentTokenCommand } from '../domain/token-commands.js';
import { decideReissueAgentToken } from '../domain/decide-reissue-agent-token.js';
import type { DecideReissueAgentTokenError } from '../domain/decide-reissue-agent-token.js';
import { applyTokenEvent } from '../domain/apply-token-event.js';
import { requireWebSessionPerson } from '../domain/require-web-session-person.js';
import { tokenStorageError } from '../domain/auth-errors.js';
import type { TokenWriteError } from '../domain/token-store.js';
import type { TokenInfo } from '../domain/token-info.js';
import type { UserServiceError } from '../domain/user-errors.js';
import type { MembershipServiceError } from '../domain/organization-errors.js';
import type { HashSecret, PersistReissue } from './token-ports.js';

export type LoadMembership = (
  userId: string,
  organizationId: string
) => ResultAsync<OrganizationMembership | null, MembershipServiceError>;

export type LoadUser = (userId: string) => ResultAsync<User | null, UserServiceError>;

export type HandleReissueAgentTokenDeps = {
  loadMembership: LoadMembership;
  loadUser: LoadUser;
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

export type ReissueAgentToken = (
  command: ReissueAgentTokenCommand
) => ResultAsync<ReissueAgentTokenResult, ReissueAgentTokenError>;

export const handleReissueAgentToken = (
  command: ReissueAgentTokenCommand,
  deps: HandleReissueAgentTokenDeps
): ResultAsync<ReissueAgentTokenResult, ReissueAgentTokenError> => {
  const human = requireWebSessionPerson(command.actor);
  if (human.isErr()) {
    return errAsync(human.error);
  }

  return deps
    .loadMembership(human.value.userId, command.organizationId)
    .andThen((actorMembership) =>
      deps.loadMembership(command.memberUserId, command.organizationId).andThen((targetMembership) =>
        deps.loadUser(command.memberUserId).andThen((targetUser) => {
          const decision = decideReissueAgentToken({
            command,
            actorRole: actorMembership?.role ?? null,
            targetMembership: targetMembership
              ? { userId: targetMembership.userId, organizationId: targetMembership.organizationId }
              : null,
            targetKind: targetUser ? principalKindOf(targetUser) : null,
            tokenName: targetUser?.name ?? null,
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
            deps.persistReissue({
              revoke,
              create: { event: create, tokenHash },
            }).map(() => ({
              token: projected,
              rawToken: `${create.id}:${secret}`,
            }))
          );
        })
      )
    );
};
