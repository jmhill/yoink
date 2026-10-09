import { err, ok, type Result } from 'neverthrow';
import type { ApiToken } from './api-token.js';
import type { MembershipRole } from './organization-membership.js';
import type { PrincipalKind } from './user.js';
import type { RenameTokenCommand } from './token-commands.js';
import type { TokenRenamed } from './token-events.js';
import { canManageOrgToken } from './can-manage-token.js';
import { requireHumanActor } from './require-human-actor.js';
import { normalizeTokenName, parseTokenName, tokenNameIsTaken } from './token-name.js';
import {
  duplicateTokenNameError,
  tokenOwnershipError,
  userTokenNotFoundError,
  type RenameTokenError,
} from './token-errors.js';

export type DecideRenameTokenInput = {
  command: RenameTokenCommand;
  current: ApiToken | null;
  existingNames: readonly string[];
  actorRole: MembershipRole | null;
  tokenOwnerKind: PrincipalKind;
};

export type DecideRenameTokenError = Exclude<RenameTokenError, { type: 'TOKEN_STORAGE_ERROR' }>;

export const decideRenameToken = ({
  command,
  current,
  existingNames,
  actorRole,
  tokenOwnerKind,
}: DecideRenameTokenInput): Result<TokenRenamed, DecideRenameTokenError> => {
  const actor = requireHumanActor(command.actor);
  if (actor.isErr()) {
    return err(actor.error);
  }

  if (!current || current.organizationId !== command.organizationId || current.revokedAt) {
    return err(userTokenNotFoundError(command.tokenId));
  }

  if (
    !canManageOrgToken({
      actorUserId: actor.value.userId,
      actorRole,
      tokenUserId: current.userId,
      tokenOwnerKind,
    })
  ) {
    return err(tokenOwnershipError(command.tokenId, actor.value.userId));
  }

  const parsed = parseTokenName(command.name);
  if (parsed.isErr()) {
    return err(parsed.error);
  }

  const name = parsed.value;
  const others = current.name
    ? existingNames.filter(
        (existing) => normalizeTokenName(existing) !== normalizeTokenName(current.name ?? '')
      )
    : existingNames;

  if (tokenNameIsTaken(name, others)) {
    return err(duplicateTokenNameError(name));
  }

  return ok({
    type: 'TokenRenamed',
    id: current.id,
    userId: current.userId,
    organizationId: current.organizationId,
    name,
  });
};
