import { err, ok, type Result } from 'neverthrow';
import type { MembershipRole } from './organization-membership.js';
import type { PrincipalKind } from './user.js';
import {
  botCannotHavePrivilegedRoleError,
  type BotCannotHavePrivilegedRoleError,
} from './organization-errors.js';

export type DecideBotRoleError = BotCannotHavePrivilegedRoleError;

/**
 * Bots (`kind === 'agent'`) can never be admin or owner.
 * Used by every path that assigns a role.
 */
export const decideBotMayHaveRole = (
  kind: PrincipalKind,
  role: MembershipRole
): Result<void, DecideBotRoleError> => {
  if (kind === 'agent' && (role === 'admin' || role === 'owner')) {
    return err(botCannotHavePrivilegedRoleError(role));
  }
  return ok(undefined);
};
