import { ORPCError } from '@orpc/server';
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
import {
  yoinkPublicServerError,
  yoinkServerError,
} from '../orpc/yoink-http-error.js';
import type { HandleCreateWorkspaceError } from '../../../access/application/handle-create-workspace.js';
import type { HandleIssueOwnerInvitationError } from '../../../access/application/handle-issue-owner-invitation.js';
import type { HandleAcceptInvitationError } from '../../../access/application/handle-accept-invitation.js';
import type { HandleValidateInvitationError } from '../../../access/application/handle-validate-invitation.js';
import type { InvitationServiceError } from '../../../access/domain/invitation-errors.js';
import type { SignupServiceError } from '../../../access/domain/signup-service.js';

type AccessClientCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'GONE';

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

export const accessHttpError = (failure: {
  readonly code: AccessClientCode;
  readonly message: string;
  readonly bodyCode?: string;
  readonly handoverPath?: string;
  readonly cause?: unknown;
}) => {
  if (failure.bodyCode === undefined && failure.handoverPath === undefined) {
    return new ORPCError(failure.code, {
      message: failure.message,
      cause: failure.cause,
    });
  }
  const data: { code?: string; handoverPath?: string } =
    failure.bodyCode === undefined
      ? { handoverPath: failure.handoverPath }
      : failure.handoverPath === undefined
        ? { code: failure.bodyCode }
        : { code: failure.bodyCode, handoverPath: failure.handoverPath };
  return new ORPCError(failure.code, {
    message: failure.message,
    data,
    cause: failure.cause,
  });
};

export const accessStorageError = (
  cause: unknown,
  bodyMessage: string,
  logMessage: string = bodyMessage,
  bodyCode?: string
) =>
  yoinkPublicServerError({
    message: logMessage,
    bodyMessage,
    bodyCode,
    cause,
  });

export const accessInternalError = (cause: unknown) =>
  yoinkServerError('Internal server error', cause);

const storageFailure = (error: unknown, message: string) =>
  accessStorageError(loggedCause(error), message);

export const createWorkspaceErrorResponse = (error: HandleCreateWorkspaceError) => {
  switch (error.type) {
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'CREATE_WORKSPACE_FAILED':
      return storageFailure(error, CREATE_WORKSPACE_STORAGE_MESSAGE);
    default: {
      const _never: never = error;
      void _never;
      return storageFailure(error, CREATE_WORKSPACE_STORAGE_MESSAGE);
    }
  }
};

export const issueOwnerInvitationErrorResponse = (error: HandleIssueOwnerInvitationError) => {
  switch (error.type) {
    case 'ORGANIZATION_NOT_FOUND':
      return accessHttpError({
        code: 'NOT_FOUND',
        message: 'Organization not found',
        bodyCode: error.type,
      });
    case 'PERSONAL_WORKSPACE_OWNER_INVITATION':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'WORKSPACE_ALREADY_HAS_OWNER':
      return accessHttpError({
        code: 'CONFLICT',
        message: error.message,
        bodyCode: error.type,
      });
    case 'BOT_CANNOT_HAVE_PRIVILEGED_ROLE':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'ISSUE_OWNER_INVITATION_FAILED':
      return storageFailure(error, CREATE_OWNER_INVITE_STORAGE_MESSAGE);
    default: {
      const _never: never = error;
      void _never;
      return storageFailure(error, CREATE_OWNER_INVITE_STORAGE_MESSAGE);
    }
  }
};

export const acceptInvitationErrorResponse = (
  error: HandleAcceptInvitationError | SignupServiceError
) => {
  switch (error.type) {
    case 'INVITATION_NOT_FOUND':
      return accessHttpError({
        code: 'NOT_FOUND',
        message: INVITATION_NOT_FOUND_MESSAGE,
        bodyCode: error.type,
      });
    case 'INVITATION_REPLACED':
      return accessHttpError({
        code: 'GONE',
        message: error.message,
        bodyCode: error.type,
      });
    case 'INVITATION_EXPIRED':
      return accessHttpError({
        code: 'GONE',
        message: INVITATION_EXPIRED_MESSAGE,
        bodyCode: error.type,
      });
    case 'INVITATION_ALREADY_ACCEPTED':
      return accessHttpError({
        code: 'GONE',
        message: INVITATION_ALREADY_USED_MESSAGE,
        bodyCode: error.type,
      });
    case 'INVITATION_EMAIL_MISMATCH':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'WORKSPACE_ALREADY_HAS_OWNER':
      return accessHttpError({
        code: 'CONFLICT',
        message: error.message,
        bodyCode: error.type,
      });
    case 'ALREADY_MEMBER_OF_ORG':
      return accessHttpError({
        code: 'CONFLICT',
        message: 'Already a member of this organization',
        bodyCode: error.type,
      });
    case 'EMAIL_ALREADY_REGISTERED':
      return accessHttpError({
        code: 'CONFLICT',
        message: EMAIL_ALREADY_HAS_ACCOUNT_MESSAGE,
        bodyCode: error.type,
      });
    case 'ORGANIZATION_NOT_FOUND':
      return storageFailure(error, ACCEPT_INVITE_STORAGE_MESSAGE);
    case 'ACCEPT_INVITATION_FAILED':
    case 'SIGNUP_STORAGE_ERROR':
    case 'INVITATION_STORAGE_ERROR':
      return storageFailure(error, ACCEPT_INVITE_STORAGE_MESSAGE);
    default: {
      const _never: never = error;
      void _never;
      return storageFailure(error, ACCEPT_INVITE_STORAGE_MESSAGE);
    }
  }
};

const invitationStorageFailure = (error: InvitationServiceError) =>
  accessInternalError(loggedCause(error));

const unexpectedInvitationServiceError = (error: InvitationServiceError) => {
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
      return invitationStorageFailure(error);
    default: {
      const _never: never = error;
      void _never;
      return invitationStorageFailure(error);
    }
  }
};

export const validateInvitationErrorResponse = (error: HandleValidateInvitationError) => {
  switch (error.type) {
    case 'INVITATION_NOT_FOUND':
      return accessHttpError({
        code: 'NOT_FOUND',
        message: INVITATION_NOT_FOUND_MESSAGE,
        bodyCode: error.type,
      });
    case 'INVITATION_REPLACED':
      return accessHttpError({
        code: 'GONE',
        message: error.message,
        bodyCode: error.type,
      });
    case 'INVITATION_EXPIRED':
      return accessHttpError({
        code: 'GONE',
        message: INVITATION_EXPIRED_MESSAGE,
        bodyCode: error.type,
      });
    case 'INVITATION_ALREADY_ACCEPTED':
      return accessHttpError({
        code: 'GONE',
        message: INVITATION_ALREADY_USED_MESSAGE,
        bodyCode: error.type,
      });
    case 'INVITATION_EMAIL_MISMATCH':
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
      });
    case 'INVITATION_STORAGE_ERROR':
      return invitationStorageFailure(error);
    default: {
      const _never: never = error;
      void _never;
      return invitationStorageFailure(error);
    }
  }
};

export const createInvitationErrorResponse = (error: InvitationServiceError) => {
  switch (error.type) {
    case 'INVITATION_ORG_NOT_FOUND':
      return accessHttpError({
        code: 'NOT_FOUND',
        message: 'Organization not found',
        bodyCode: error.type,
      });
    case 'INSUFFICIENT_INVITE_PERMISSIONS':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions to create invitation',
        bodyCode: error.type,
      });
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
      return invitationStorageFailure(error);
    default: {
      const _never: never = error;
      void _never;
      return invitationStorageFailure(error);
    }
  }
};

export const listPendingInvitationErrorResponse = (error: InvitationServiceError) =>
  unexpectedInvitationServiceError(error);

export const revokeInvitationErrorResponse = (error: InvitationServiceError) => {
  switch (error.type) {
    case 'INVITATION_NOT_FOUND':
      return accessHttpError({
        code: 'NOT_FOUND',
        message: INVITATION_NOT_FOUND_MESSAGE,
        bodyCode: error.type,
      });
    case 'INSUFFICIENT_INVITE_PERMISSIONS':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions to revoke invitation',
        bodyCode: error.type,
      });
    case 'OWNER_INVITATION_ADMIN_ONLY':
      return accessHttpError({
        code: 'FORBIDDEN',
        message: OWNER_INVITE_ADMIN_ONLY_MESSAGE,
        bodyCode: error.type,
      });
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
      return invitationStorageFailure(error);
    default: {
      const _never: never = error;
      void _never;
      return invitationStorageFailure(error);
    }
  }
};

export const adminCreateInvitationErrorResponse = (error: InvitationServiceError) => {
  switch (error.type) {
    case 'INVITATION_ORG_NOT_FOUND':
      return accessHttpError({
        code: 'NOT_FOUND',
        message: 'Organization not found',
        bodyCode: error.type,
      });
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
      return invitationStorageFailure(error);
    default: {
      const _never: never = error;
      void _never;
      return invitationStorageFailure(error);
    }
  }
};
