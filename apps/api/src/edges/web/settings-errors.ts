import {
  BOT_CANNOT_CHANGE_ROLES_MESSAGE,
  THERE_HAS_TO_BE_AT_LEAST_ONE_ADMIN_MESSAGE,
  CANNOT_CHANGE_OWN_ROLE_MESSAGE,
  CANNOT_REMOVE_SELF_MESSAGE,
  CHANGE_ROLE_STORAGE_MESSAGE,
  HANDOVER_OWNERSHIP_PATH,
  OWNER_ROLE_LOCKED_MESSAGE,
  REISSUE_NOT_ALLOWED_MESSAGE,
  REISSUE_TOKEN_STORAGE_MESSAGE,
  REMOVE_NOT_ALLOWED_MESSAGE,
  ROLE_CHANGE_NOT_ALLOWED_MESSAGE,
  TRANSFER_OWNERSHIP_STORAGE_MESSAGE,
  removeMemberFailedMessage,
} from '@yoink/api-contracts';
import type { AgentServiceError } from '../../access/domain/index.js';
import type { SessionServiceError } from '../../access/domain/auth-errors.js';
import type { MembershipServiceError } from '../../access/domain/organization-errors.js';
import type { CreateTokenError, ListTokensError, RevokeTokenError } from '../../access/domain/token-errors.js';
import type { UserServiceError } from '../../access/domain/user-errors.js';
import type { ReissueAgentTokenError } from '../../access/application/handle-reissue-agent-token.js';
import type { HandleTransferOwnershipError } from '../../access/application/handle-transfer-ownership.js';
import type { HandleChangeMemberRoleError } from '../../access/application/handle-change-member-role.js';
import type { HandleRemoveMemberError } from '../../access/application/handle-remove-member.js';
import { accessHttpError, accessStorageError } from '../_shared/auth/access-http-errors.js';

/**
 * Copied from the legacy organization and token routes so this edge does not
 * import those registrars. Statuses and bodies stay the same.
 */

export const leaveErrorResponse = (error: HandleRemoveMemberError) => {
  switch (error.type) {
    case 'MEMBERSHIP_NOT_FOUND':
      return accessHttpError({
        code: 'NOT_FOUND',
        message: 'Not a member of this organization',
        bodyCode: error.type,
      });
    case 'CANNOT_LEAVE_PERSONAL_ORG':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: 'Cannot leave your personal organization',
        bodyCode: error.type,
      });
    case 'LAST_ADMIN':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: 'Cannot leave as the last admin',
        bodyCode: error.type,
      });
    case 'OWNER_MUST_TRANSFER':
      return accessHttpError({
        code: 'CONFLICT',
        message: error.message,
        bodyCode: error.type,
        handoverPath: HANDOVER_OWNERSHIP_PATH,
      });
    case 'MEMBER_REMOVE_FAILED':
      return accessStorageError(error.cause, 'Failed to leave organization');
    case 'OWNER_CANNOT_BE_REMOVED':
    case 'CANNOT_REMOVE_SELF':
    case 'REMOVE_NOT_ALLOWED':
    case 'USER_NOT_FOUND':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to leave organization');
    default: {
      const _never: never = error;
      return accessStorageError(_never, 'Failed to leave organization');
    }
  }
};

export const removeMemberErrorResponse = (error: HandleRemoveMemberError) => {
  switch (error.type) {
    case 'MEMBERSHIP_NOT_FOUND':
      return accessHttpError({
        code: 'NOT_FOUND',
        message: 'Member not found',
        bodyCode: error.type,
      });
    case 'CANNOT_REMOVE_SELF':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: CANNOT_REMOVE_SELF_MESSAGE,
        bodyCode: error.type,
      });
    case 'CANNOT_LEAVE_PERSONAL_ORG':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: 'Cannot remove a member from a personal workspace',
        bodyCode: error.type,
      });
    case 'OWNER_CANNOT_BE_REMOVED':
      return accessHttpError({
        code: 'CONFLICT',
        message: error.message,
        bodyCode: error.type,
      });
    case 'REMOVE_NOT_ALLOWED':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: REMOVE_NOT_ALLOWED_MESSAGE,
        bodyCode: error.type,
      });
    case 'LAST_ADMIN':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: 'Cannot remove the last admin',
        bodyCode: error.type,
      });
    case 'OWNER_MUST_TRANSFER':
      return accessHttpError({
        code: 'CONFLICT',
        message: error.message,
        bodyCode: error.type,
      });
    case 'MEMBER_REMOVE_FAILED':
      return accessStorageError(error.cause, removeMemberFailedMessage(error.memberName));
    case 'USER_NOT_FOUND':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, removeMemberFailedMessage('member'));
    default: {
      const _never: never = error;
      return accessStorageError(_never, removeMemberFailedMessage('member'));
    }
  }
};

export const changeMemberRoleErrorResponse = (
  error: HandleChangeMemberRoleError,
  callerUserId: string
) => {
  switch (error.type) {
    case 'BOT_CANNOT_CHANGE_ROLES':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: BOT_CANNOT_CHANGE_ROLES_MESSAGE,
        bodyCode: error.type,
      });
    case 'MEMBERSHIP_NOT_FOUND':
      if (error.userId === callerUserId) {
        return accessHttpError({
          code: 'FORBIDDEN',
          message: 'Not a member of this organization',
          bodyCode: error.type,
        });
      }
      return accessHttpError({
        code: 'NOT_FOUND',
        message: 'Member not found',
        bodyCode: error.type,
      });
    case 'ROLE_CHANGE_NOT_ALLOWED':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: ROLE_CHANGE_NOT_ALLOWED_MESSAGE,
        bodyCode: error.type,
      });
    case 'CANNOT_CHANGE_OWN_ROLE':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: CANNOT_CHANGE_OWN_ROLE_MESSAGE,
        bodyCode: error.type,
      });
    case 'OWNER_ROLE_LOCKED':
      return accessHttpError({
        code: 'CONFLICT',
        message: OWNER_ROLE_LOCKED_MESSAGE,
        bodyCode: error.type,
      });
    case 'CANNOT_ASSIGN_OWNER_ROLE':
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'LAST_ADMIN':
      return accessHttpError({
        code: 'CONFLICT',
        message: THERE_HAS_TO_BE_AT_LEAST_ONE_ADMIN_MESSAGE,
        bodyCode: error.type,
      });
    case 'OWNER_MUST_TRANSFER':
      return accessHttpError({
        code: 'CONFLICT',
        message: error.message,
        bodyCode: error.type,
      });
    case 'USER_NOT_FOUND':
      return accessHttpError({
        code: 'NOT_FOUND',
        message: 'Member not found',
        bodyCode: error.type,
      });
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, CHANGE_ROLE_STORAGE_MESSAGE);
    default: {
      const _never: never = error;
      return accessStorageError(_never, CHANGE_ROLE_STORAGE_MESSAGE);
    }
  }
};

export const reissueAgentTokenErrorResponse = (
  error: ReissueAgentTokenError,
  callerUserId: string
) => {
  switch (error.type) {
    case 'BOT_CANNOT_MANAGE_TOKENS':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: error.message,
        bodyCode: error.type,
      });
    case 'INVALID_TOKEN_NAME':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'REISSUE_NOT_ALLOWED':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: REISSUE_NOT_ALLOWED_MESSAGE,
        bodyCode: error.type,
      });
    case 'MEMBERSHIP_NOT_FOUND':
      if (error.userId === callerUserId) {
        return accessHttpError({
          code: 'FORBIDDEN',
          message: 'Not a member of this organization',
          bodyCode: error.type,
        });
      }
      return accessHttpError({
        code: 'NOT_FOUND',
        message: 'Agent member not found',
        bodyCode: error.type,
      });
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
    case 'TOKEN_STORAGE_ERROR':
    case 'USER_NOT_FOUND':
      return accessStorageError(
        error,
        REISSUE_TOKEN_STORAGE_MESSAGE,
        'Failed to reissue agent token'
      );
    default: {
      const _never: never = error;
      return accessStorageError(
        _never,
        REISSUE_TOKEN_STORAGE_MESSAGE,
        'Failed to reissue agent token'
      );
    }
  }
};

export const transferOwnershipErrorResponse = (error: HandleTransferOwnershipError) => {
  switch (error.type) {
    case 'BOT_CANNOT_TRANSFER_OWNERSHIP':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: error.message,
        bodyCode: error.type,
      });
    case 'NOT_CURRENT_OWNER':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: error.message,
        bodyCode: error.type,
      });
    case 'PERSONAL_WORKSPACE_TRANSFER':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'ALREADY_OWNER':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'USER_NOT_FOUND':
      return accessHttpError({
        code: 'NOT_FOUND',
        message: 'User not found',
        bodyCode: error.type,
      });
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'TARGET_NOT_WORKSPACE_MEMBER':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'OWNER_MUST_TRANSFER':
      return accessHttpError({
        code: 'CONFLICT',
        message: error.message,
        bodyCode: error.type,
        handoverPath: HANDOVER_OWNERSHIP_PATH,
      });
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, TRANSFER_OWNERSHIP_STORAGE_MESSAGE);
    default: {
      const _never: never = error;
      return accessStorageError(_never, TRANSFER_OWNERSHIP_STORAGE_MESSAGE);
    }
  }
};

export const switchOrganizationFailure = (error: SessionServiceError, organizationId: string) => {
  switch (error.type) {
    case 'NOT_A_MEMBER':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: `User is not a member of organization ${organizationId}`,
      });
    case 'SESSION_NOT_FOUND':
      return accessHttpError({ code: 'UNAUTHORIZED', message: 'Session not found' });
    case 'USER_NOT_FOUND':
    case 'NO_MEMBERSHIPS':
    case 'SESSION_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
    case 'ALREADY_MEMBER':
    case 'MEMBERSHIP_NOT_FOUND':
    case 'CANNOT_LEAVE_PERSONAL_ORG':
    case 'CANNOT_ASSIGN_OWNER_ROLE':
    case 'OWNER_MUST_TRANSFER':
    case 'OWNER_CANNOT_BE_REMOVED':
    case 'NOT_CURRENT_OWNER':
    case 'BOT_CANNOT_TRANSFER_OWNERSHIP':
    case 'PERSONAL_WORKSPACE_TRANSFER':
    case 'ALREADY_OWNER':
    case 'SECOND_OWNER':
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
    case 'TARGET_NOT_WORKSPACE_MEMBER':
    case 'LAST_ADMIN':
    case 'INSUFFICIENT_PERMISSIONS':
    case 'BOT_CANNOT_CHANGE_ROLES':
    case 'ROLE_CHANGE_NOT_ALLOWED':
    case 'CANNOT_CHANGE_OWN_ROLE':
    case 'OWNER_ROLE_LOCKED':
    case 'CANNOT_REMOVE_SELF':
    case 'REMOVE_NOT_ALLOWED':
    case 'REISSUE_NOT_ALLOWED':
    case 'ORGANIZATION_NOT_FOUND':
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'ORGANIZATION_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to switch organization');
    default: {
      const _never: never = error;
      return accessStorageError(_never, 'Failed to switch organization');
    }
  }
};

export const membershipFailure = (error: MembershipServiceError, message: string) => {
  switch (error.type) {
    case 'ALREADY_MEMBER':
    case 'MEMBERSHIP_NOT_FOUND':
    case 'CANNOT_LEAVE_PERSONAL_ORG':
    case 'CANNOT_ASSIGN_OWNER_ROLE':
    case 'OWNER_MUST_TRANSFER':
    case 'OWNER_CANNOT_BE_REMOVED':
    case 'NOT_CURRENT_OWNER':
    case 'BOT_CANNOT_TRANSFER_OWNERSHIP':
    case 'PERSONAL_WORKSPACE_TRANSFER':
    case 'ALREADY_OWNER':
    case 'SECOND_OWNER':
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
    case 'TARGET_NOT_WORKSPACE_MEMBER':
    case 'LAST_ADMIN':
    case 'INSUFFICIENT_PERMISSIONS':
    case 'BOT_CANNOT_CHANGE_ROLES':
    case 'ROLE_CHANGE_NOT_ALLOWED':
    case 'CANNOT_CHANGE_OWN_ROLE':
    case 'OWNER_ROLE_LOCKED':
    case 'CANNOT_REMOVE_SELF':
    case 'REMOVE_NOT_ALLOWED':
    case 'REISSUE_NOT_ALLOWED':
    case 'USER_NOT_FOUND':
    case 'ORGANIZATION_NOT_FOUND':
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'ORGANIZATION_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, message);
    default: {
      const _never: never = error;
      return accessStorageError(_never, message);
    }
  }
};

export const userFailure = (error: UserServiceError, message: string) => {
  switch (error.type) {
    case 'USER_NOT_FOUND':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, message);
    default: {
      const _never: never = error;
      return accessStorageError(_never, message);
    }
  }
};

export const mintAgentFailure = (error: AgentServiceError) => {
  switch (error.type) {
    case 'MEMBERSHIP_NOT_FOUND':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: 'Not a member of this organization',
      });
    case 'INSUFFICIENT_PERMISSIONS':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: 'Only owners and admins can mint agents',
      });
    case 'BOT_CANNOT_MANAGE_TOKENS':
      return accessHttpError({ code: 'FORBIDDEN', message: error.message });
    case 'INVALID_TOKEN_NAME':
      return accessHttpError({ code: 'BAD_REQUEST', message: error.message });
    case 'ORGANIZATION_NOT_FOUND':
      return accessHttpError({ code: 'NOT_FOUND', message: 'Organization not found' });
    case 'MEMBERSHIP_STORAGE_ERROR':
    case 'ORGANIZATION_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
    case 'TOKEN_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to mint agent');
    default: {
      const _never: never = error;
      return accessStorageError(_never, 'Failed to mint agent');
    }
  }
};

export const createTokenFailure = (error: CreateTokenError) => {
  switch (error.type) {
    case 'INVALID_TOKEN_NAME':
      return accessHttpError({ code: 'BAD_REQUEST', message: error.message });
    case 'BOT_CANNOT_MANAGE_TOKENS':
      return accessHttpError({ code: 'FORBIDDEN', message: error.message });
    case 'TOKEN_OWNERSHIP_ERROR':
      return accessHttpError({ code: 'FORBIDDEN', message: 'You do not own this token' });
    case 'TOKEN_LIMIT_REACHED':
      return accessHttpError({
        code: 'CONFLICT',
        message: `You can have at most ${error.limit} API tokens per organization`,
      });
    case 'TOKEN_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to create token');
    default: {
      const _never: never = error;
      return accessStorageError(_never, 'Failed to create token');
    }
  }
};

export const deleteTokenFailure = (error: RevokeTokenError) => {
  switch (error.type) {
    case 'BOT_CANNOT_MANAGE_TOKENS':
      return accessHttpError({ code: 'FORBIDDEN', message: error.message });
    case 'TOKEN_OWNERSHIP_ERROR':
      return accessHttpError({ code: 'FORBIDDEN', message: 'You do not own this token' });
    case 'USER_TOKEN_NOT_FOUND':
      return accessHttpError({ code: 'NOT_FOUND', message: 'Token not found' });
    case 'TOKEN_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to delete token');
    default: {
      const _never: never = error;
      return accessStorageError(_never, 'Failed to delete token');
    }
  }
};

export const listTokensFailure = (error: ListTokensError) => {
  switch (error.type) {
    case 'TOKEN_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to list tokens');
  }
};
