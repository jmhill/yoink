import type { FastifyRequest } from 'fastify';
import {
  ACCEPT_INVITE_STORAGE_MESSAGE,
  CREATE_OWNER_INVITE_STORAGE_MESSAGE,
  CREATE_WORKSPACE_STORAGE_MESSAGE,
  EMAIL_ALREADY_HAS_ACCOUNT_MESSAGE,
  INVITATION_ALREADY_USED_MESSAGE,
  INVITATION_EXPIRED_MESSAGE,
  INVITATION_NOT_FOUND_MESSAGE,
  OWNER_INVITE_ADMIN_ONLY_MESSAGE,
} from '@yoink/api-contracts';
import type { HandleCreateWorkspaceError } from './handle-create-workspace.js';
import type { HandleIssueOwnerInvitationError } from './handle-issue-owner-invitation.js';
import type { HandleAcceptInvitationError } from './handle-accept-invitation.js';
import type { HandleValidateInvitationError } from './handle-validate-invitation.js';
import type { InvitationServiceError } from '../domain/invitation-errors.js';
import type { SignupServiceError } from '../domain/signup-service.js';

const asLoggedError = (value: unknown): unknown => {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
};

export const loggedCause = (error: unknown): unknown => {
  if (typeof error === 'object' && error !== null && 'cause' in error) {
    return asLoggedError(error.cause);
  }
  return asLoggedError(error);
};

export const logAndReturnStorageFailure = (
  request: FastifyRequest,
  error: unknown,
  message: string
) => {
  request.log.error({ error: loggedCause(error) }, message);
  return {
    status: 500 as const,
    body: { message },
  };
};

export const createWorkspaceErrorResponse = (
  request: FastifyRequest,
  error: HandleCreateWorkspaceError
) => {
  switch (error.type) {
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
      return {
        status: 400 as const,
        body: { message: error.message, code: error.type },
      };
    case 'CREATE_WORKSPACE_FAILED':
      return logAndReturnStorageFailure(
        request,
        error,
        CREATE_WORKSPACE_STORAGE_MESSAGE
      );
    default: {
      const _never: never = error;
      void _never;
      return logAndReturnStorageFailure(
        request,
        error,
        CREATE_WORKSPACE_STORAGE_MESSAGE
      );
    }
  }
};

export const issueOwnerInvitationErrorResponse = (
  request: FastifyRequest,
  error: HandleIssueOwnerInvitationError
) => {
  switch (error.type) {
    case 'ORGANIZATION_NOT_FOUND':
      return {
        status: 404 as const,
        body: { message: 'Organization not found', code: error.type },
      };
    case 'PERSONAL_WORKSPACE_OWNER_INVITATION':
      return {
        status: 400 as const,
        body: { message: error.message, code: error.type },
      };
    case 'WORKSPACE_ALREADY_HAS_OWNER':
      return {
        status: 409 as const,
        body: { message: error.message, code: error.type },
      };
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
      return {
        status: 400 as const,
        body: { message: error.message, code: error.type },
      };
    case 'ISSUE_OWNER_INVITATION_FAILED':
      return logAndReturnStorageFailure(
        request,
        error,
        CREATE_OWNER_INVITE_STORAGE_MESSAGE
      );
    default: {
      const _never: never = error;
      void _never;
      return logAndReturnStorageFailure(
        request,
        error,
        CREATE_OWNER_INVITE_STORAGE_MESSAGE
      );
    }
  }
};

export const acceptInvitationErrorResponse = (
  request: FastifyRequest,
  error: HandleAcceptInvitationError | SignupServiceError
) => {
  switch (error.type) {
    case 'INVITATION_NOT_FOUND':
      return {
        status: 404 as const,
        body: { message: INVITATION_NOT_FOUND_MESSAGE, code: error.type },
      };
    case 'INVITATION_REPLACED':
      return {
        status: 410 as const,
        body: { message: error.message, code: error.type },
      };
    case 'INVITATION_EXPIRED':
      return {
        status: 410 as const,
        body: { message: INVITATION_EXPIRED_MESSAGE, code: error.type },
      };
    case 'INVITATION_ALREADY_ACCEPTED':
      return {
        status: 410 as const,
        body: { message: INVITATION_ALREADY_USED_MESSAGE, code: error.type },
      };
    case 'INVITATION_EMAIL_MISMATCH':
      return {
        status: 400 as const,
        body: { message: error.message, code: error.type },
      };
    case 'WORKSPACE_ALREADY_HAS_OWNER':
      return {
        status: 409 as const,
        body: { message: error.message, code: error.type },
      };
    case 'ALREADY_MEMBER_OF_ORG':
      return {
        status: 409 as const,
        body: { message: 'Already a member of this organization', code: error.type },
      };
    case 'EMAIL_ALREADY_REGISTERED':
      return {
        status: 409 as const,
        body: { message: EMAIL_ALREADY_HAS_ACCOUNT_MESSAGE, code: error.type },
      };
    case 'ORGANIZATION_NOT_FOUND':
      return logAndReturnStorageFailure(request, error, ACCEPT_INVITE_STORAGE_MESSAGE);
    case 'ACCEPT_INVITATION_FAILED':
    case 'SIGNUP_STORAGE_ERROR':
    case 'INVITATION_STORAGE_ERROR':
      return logAndReturnStorageFailure(request, error, ACCEPT_INVITE_STORAGE_MESSAGE);
    default: {
      const _never: never = error;
      void _never;
      return logAndReturnStorageFailure(request, error, ACCEPT_INVITE_STORAGE_MESSAGE);
    }
  }
};

const invitationStorageFailure = (
  request: FastifyRequest,
  error: InvitationServiceError
) => logAndReturnStorageFailure(request, error, 'Internal server error');

const unexpectedInvitationServiceError = (
  request: FastifyRequest,
  error: InvitationServiceError
) => {
  switch (error.type) {
    case 'INVITATION_NOT_FOUND':
    case 'INVITATION_REPLACED':
    case 'INVITATION_EXPIRED':
    case 'INVITATION_ALREADY_ACCEPTED':
    case 'INVITATION_EMAIL_MISMATCH':
    case 'ALREADY_MEMBER_OF_ORG':
    case 'INSUFFICIENT_INVITE_PERMISSIONS':
    case 'OWNER_INVITATION_ADMIN_ONLY':
    case 'INVITATION_ORG_NOT_FOUND':
    case 'WORKSPACE_ALREADY_HAS_OWNER':
    case 'PERSONAL_WORKSPACE_OWNER_INVITATION':
    case 'EMAIL_ALREADY_EXISTS':
    case 'INVITATION_USER_NOT_FOUND':
    case 'CREATE_WORKSPACE_FAILED':
    case 'ISSUE_OWNER_INVITATION_FAILED':
    case 'ACCEPT_INVITATION_FAILED':
    case 'INVITATION_STORAGE_ERROR':
    case 'ORGANIZATION_STORAGE_ERROR':
    case 'MEMBERSHIP_STORAGE_ERROR':
      return invitationStorageFailure(request, error);
    default: {
      const _never: never = error;
      void _never;
      return invitationStorageFailure(request, error);
    }
  }
};

export const validateInvitationErrorResponse = (
  request: FastifyRequest,
  error: HandleValidateInvitationError
) => {
  switch (error.type) {
    case 'INVITATION_NOT_FOUND':
      return {
        status: 404 as const,
        body: { message: INVITATION_NOT_FOUND_MESSAGE, code: error.type },
      };
    case 'INVITATION_REPLACED':
      return {
        status: 410 as const,
        body: { message: error.message, code: error.type },
      };
    case 'INVITATION_EXPIRED':
      return {
        status: 410 as const,
        body: { message: INVITATION_EXPIRED_MESSAGE, code: error.type },
      };
    case 'INVITATION_ALREADY_ACCEPTED':
      return {
        status: 410 as const,
        body: { message: INVITATION_ALREADY_USED_MESSAGE, code: error.type },
      };
    case 'INVITATION_EMAIL_MISMATCH':
      return {
        status: 400 as const,
        body: { message: error.message, code: error.type },
      };
    case 'INVITATION_STORAGE_ERROR':
      return invitationStorageFailure(request, error);
    default: {
      const _never: never = error;
      void _never;
      return invitationStorageFailure(request, error);
    }
  }
};

export const createInvitationErrorResponse = (
  request: FastifyRequest,
  error: InvitationServiceError
) => {
  switch (error.type) {
    case 'INVITATION_ORG_NOT_FOUND':
      return {
        status: 404 as const,
        body: { message: 'Organization not found', code: error.type },
      };
    case 'INSUFFICIENT_INVITE_PERMISSIONS':
      return {
        status: 403 as const,
        body: {
          message: 'Insufficient permissions to create invitation',
          code: error.type,
        },
      };
    case 'INVITATION_NOT_FOUND':
    case 'INVITATION_REPLACED':
    case 'INVITATION_EXPIRED':
    case 'INVITATION_ALREADY_ACCEPTED':
    case 'INVITATION_EMAIL_MISMATCH':
    case 'ALREADY_MEMBER_OF_ORG':
    case 'OWNER_INVITATION_ADMIN_ONLY':
    case 'WORKSPACE_ALREADY_HAS_OWNER':
    case 'PERSONAL_WORKSPACE_OWNER_INVITATION':
    case 'EMAIL_ALREADY_EXISTS':
    case 'INVITATION_USER_NOT_FOUND':
    case 'CREATE_WORKSPACE_FAILED':
    case 'ISSUE_OWNER_INVITATION_FAILED':
    case 'ACCEPT_INVITATION_FAILED':
    case 'INVITATION_STORAGE_ERROR':
    case 'ORGANIZATION_STORAGE_ERROR':
    case 'MEMBERSHIP_STORAGE_ERROR':
      return invitationStorageFailure(request, error);
    default: {
      const _never: never = error;
      void _never;
      return invitationStorageFailure(request, error);
    }
  }
};

export const listPendingInvitationErrorResponse = (
  request: FastifyRequest,
  error: InvitationServiceError
) => unexpectedInvitationServiceError(request, error);

export const revokeInvitationErrorResponse = (
  request: FastifyRequest,
  error: InvitationServiceError
) => {
  switch (error.type) {
    case 'INVITATION_NOT_FOUND':
      return {
        status: 404 as const,
        body: { message: INVITATION_NOT_FOUND_MESSAGE, code: error.type },
      };
    case 'INSUFFICIENT_INVITE_PERMISSIONS':
      return {
        status: 403 as const,
        body: {
          message: 'Insufficient permissions to revoke invitation',
          code: error.type,
        },
      };
    case 'OWNER_INVITATION_ADMIN_ONLY':
      return {
        status: 403 as const,
        body: { message: OWNER_INVITE_ADMIN_ONLY_MESSAGE, code: error.type },
      };
    case 'INVITATION_REPLACED':
    case 'INVITATION_EXPIRED':
    case 'INVITATION_ALREADY_ACCEPTED':
    case 'INVITATION_EMAIL_MISMATCH':
    case 'ALREADY_MEMBER_OF_ORG':
    case 'INVITATION_ORG_NOT_FOUND':
    case 'WORKSPACE_ALREADY_HAS_OWNER':
    case 'PERSONAL_WORKSPACE_OWNER_INVITATION':
    case 'EMAIL_ALREADY_EXISTS':
    case 'INVITATION_USER_NOT_FOUND':
    case 'CREATE_WORKSPACE_FAILED':
    case 'ISSUE_OWNER_INVITATION_FAILED':
    case 'ACCEPT_INVITATION_FAILED':
    case 'INVITATION_STORAGE_ERROR':
    case 'ORGANIZATION_STORAGE_ERROR':
    case 'MEMBERSHIP_STORAGE_ERROR':
      return invitationStorageFailure(request, error);
    default: {
      const _never: never = error;
      void _never;
      return invitationStorageFailure(request, error);
    }
  }
};

export const adminCreateInvitationErrorResponse = (
  request: FastifyRequest,
  error: InvitationServiceError
) => {
  switch (error.type) {
    case 'INVITATION_ORG_NOT_FOUND':
      return {
        status: 404 as const,
        body: { message: 'Organization not found', code: error.type },
      };
    case 'INVITATION_NOT_FOUND':
    case 'INVITATION_REPLACED':
    case 'INVITATION_EXPIRED':
    case 'INVITATION_ALREADY_ACCEPTED':
    case 'INVITATION_EMAIL_MISMATCH':
    case 'ALREADY_MEMBER_OF_ORG':
    case 'INSUFFICIENT_INVITE_PERMISSIONS':
    case 'OWNER_INVITATION_ADMIN_ONLY':
    case 'WORKSPACE_ALREADY_HAS_OWNER':
    case 'PERSONAL_WORKSPACE_OWNER_INVITATION':
    case 'EMAIL_ALREADY_EXISTS':
    case 'INVITATION_USER_NOT_FOUND':
    case 'CREATE_WORKSPACE_FAILED':
    case 'ISSUE_OWNER_INVITATION_FAILED':
    case 'ACCEPT_INVITATION_FAILED':
    case 'INVITATION_STORAGE_ERROR':
    case 'ORGANIZATION_STORAGE_ERROR':
    case 'MEMBERSHIP_STORAGE_ERROR':
      return invitationStorageFailure(request, error);
    default: {
      const _never: never = error;
      void _never;
      return invitationStorageFailure(request, error);
    }
  }
};
