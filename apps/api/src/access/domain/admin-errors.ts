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
import type { ProjectNotFoundError, StorageError as ProjectStorageError } from '../../modules/task-management/domain/messages/project-errors.js';

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
  | ProjectNotFoundError
  | ProjectStorageError
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
