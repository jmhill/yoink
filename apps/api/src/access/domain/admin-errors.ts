import {
  organizationNotFoundError,
  type BotCannotChangeRolesError,
  type BotCannotHavePrivilegedRoleError,
  type CannotAssignOwnerRoleError,
  type CannotChangeOwnRoleError,
  type LastAdminError,
  type MembershipNotFoundError,
  type MembershipStorageError,
  type OrganizationNotFoundError,
  type OrganizationStorageError,
  type OwnerMustTransferError,
  type OwnerRoleLockedError,
  type RoleChangeNotAllowedError,
  type TargetNotWorkspaceMemberError,
} from './organization-errors.js';
import {
  userNotFoundError,
  type UserNotFoundError,
  type UserStorageError,
} from './user-errors.js';
import {
  tokenNotFoundError,
  type TokenNotFoundError,
  type TokenStorageError,
} from './auth-errors.js';
import type { InvalidTokenNameError } from './token-errors.js';

/** Same fields as the project store's not-found error. Access does not import that module. */
export type AdminProjectNotFoundError = {
  readonly type: 'PROJECT_NOT_FOUND';
  readonly id: string;
  readonly message: string;
};

export const adminProjectNotFoundError = (id: string): AdminProjectNotFoundError => ({
  type: 'PROJECT_NOT_FOUND',
  id,
  message: 'Project not found',
});

/** Same fields as the project store's storage error. */
export type AdminProjectStorageError = {
  readonly type: 'STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

// Re-export storage errors for convenience
export type { OrganizationStorageError, MembershipStorageError, UserStorageError, TokenStorageError };

export {
  organizationNotFoundError,
  type OrganizationNotFoundError,
  tokenNotFoundError,
  type TokenNotFoundError,
  userNotFoundError,
  type UserNotFoundError,
};

// Union type for all admin service errors
export type AdminServiceError =
  | OrganizationStorageError
  | MembershipStorageError
  | UserStorageError
  | TokenStorageError
  | OrganizationNotFoundError
  | UserNotFoundError
  | TokenNotFoundError
  | InvalidTokenNameError
  | AdminProjectNotFoundError
  | AdminProjectStorageError
  | BotCannotHavePrivilegedRoleError
  | CannotAssignOwnerRoleError
  | LastAdminError
  | MembershipNotFoundError
  | OwnerMustTransferError
  | TargetNotWorkspaceMemberError
  | BotCannotChangeRolesError
  | RoleChangeNotAllowedError
  | CannotChangeOwnRoleError
  | OwnerRoleLockedError;
