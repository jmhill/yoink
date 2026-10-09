import { err, ok, type Result } from 'neverthrow';
import type { MembershipRole } from './organization-membership.js';
import type { PrincipalKind } from './user.js';
import type { CreateNamedTokenCommand } from './token-commands.js';
import type { TokenCreated } from './token-events.js';
import { canManageOrgToken } from './can-manage-token.js';
import { requireHumanActor } from './require-human-actor.js';
import {
  invalidTokenNameError,
  tokenLimitReachedError,
  tokenOwnershipError,
  type CreateNamedTokenError,
} from './token-errors.js';

export type DecideCreateTokenInput = {
  command: CreateNamedTokenCommand;
  tokenCountForUser: number;
  maxTokensPerUserPerOrg: number;
  actorRole: MembershipRole | null;
  targetKind: PrincipalKind;
  id: string;
  now: string;
};

export type DecideCreateTokenError = Exclude<CreateNamedTokenError, { type: 'TOKEN_STORAGE_ERROR' }>;

export const decideCreateToken = ({
  command,
  tokenCountForUser,
  maxTokensPerUserPerOrg,
  actorRole,
  targetKind,
  id,
  now,
}: DecideCreateTokenInput): Result<TokenCreated, DecideCreateTokenError> => {
  const actor = requireHumanActor(command.actor);
  if (actor.isErr()) {
    return err(actor.error);
  }

  if (
    command.userId !== actor.value.userId &&
    !canManageOrgToken({
      actorUserId: actor.value.userId,
      actorRole,
      tokenUserId: command.userId,
      tokenOwnerKind: targetKind,
    })
  ) {
    return err(tokenOwnershipError(id, actor.value.userId));
  }

  const name = command.name.trim();
  if (name.length === 0) {
    return err(invalidTokenNameError('Name is required'));
  }

  if (tokenCountForUser >= maxTokensPerUserPerOrg) {
    return err(
      tokenLimitReachedError(command.userId, command.organizationId, maxTokensPerUserPerOrg)
    );
  }

  return ok({
    type: 'TokenCreated',
    id,
    userId: command.userId,
    organizationId: command.organizationId,
    name,
    createdAt: now,
  });
};
