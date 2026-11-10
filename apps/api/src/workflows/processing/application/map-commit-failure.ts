import type { CommitFailure } from '../../../kernel/unit-of-work.js';
import {
  captureNotInInboxError,
  storageError as captureStorageError,
  type CaptureNotFoundError,
  type CaptureNotInInboxError,
  type StorageError as CaptureStorageError,
} from '../../../modules/captures/index.js';
import {
  duplicateProjectNameError,
  storageError as projectStorageError,
  type CreateProjectError,
  type CreateTaskError,
} from '../../../modules/task-management/index.js';

export type ProcessCaptureToTaskError =
  | CaptureStorageError
  | CaptureNotFoundError
  | CaptureNotInInboxError
  | CreateTaskError;

export type ProcessCaptureToProjectError =
  | CaptureStorageError
  | CaptureNotFoundError
  | CaptureNotInInboxError
  | Extract<
      CreateProjectError,
      {
        type:
          | 'STORAGE_ERROR'
          | 'INVALID_PROJECT_NAME'
          | 'PROJECT_NAME_BLANK'
          | 'DUPLICATE_PROJECT_NAME'
          | 'PROJECT_CREATE_REQUIRES_PERSON';
      }
    >;

const inboxGuardMiss = (
  failure: CommitFailure,
  captureId: string
): CaptureNotInInboxError | undefined => {
  if (
    failure.kind === 'Conflict' &&
    failure.owner === 'captures' &&
    failure.reason === 'guard-miss'
  ) {
    return captureNotInInboxError(captureId);
  }
  return undefined;
};

/** The inbox guard is a captures Conflict. The public error stays CAPTURE_NOT_IN_INBOX. */
export const mapProcessToTaskCommit = (
  failure: CommitFailure,
  captureId: string
): ProcessCaptureToTaskError =>
  inboxGuardMiss(failure, captureId) ??
  captureStorageError('Failed to process capture to task', failure);

export const mapProcessToProjectCommit = (
  failure: CommitFailure,
  input: { readonly captureId: string; readonly projectName: string }
): ProcessCaptureToProjectError => {
  const inbox = inboxGuardMiss(failure, input.captureId);
  if (inbox !== undefined) {
    return inbox;
  }
  if (
    failure.kind === 'Conflict' &&
    failure.owner === 'task-management' &&
    failure.reason === 'duplicate-name'
  ) {
    return duplicateProjectNameError(input.projectName);
  }
  return projectStorageError('Failed to process capture to project', failure);
};

/**
 * prepare.createProject can refuse proposal-only cases this command cannot send.
 * Those stay off the public process-to-project union.
 */
export const projectPrepareError = (
  error: CreateProjectError
): ProcessCaptureToProjectError => {
  switch (error.type) {
    case 'INVALID_PROJECT_NAME':
    case 'PROJECT_NAME_BLANK':
    case 'DUPLICATE_PROJECT_NAME':
    case 'PROJECT_CREATE_REQUIRES_PERSON':
    case 'STORAGE_ERROR':
      return error;
    case 'PROJECT_PROPOSE_REQUIRES_BOT':
    case 'INVALID_PROJECT_STATUS':
    case 'INVALID_PROJECT_REASON':
    case 'INVALID_SUGGESTED_NEXT_ACTION':
      return projectStorageError('Failed to process capture to project', error);
    default: {
      const _never: never = error;
      return projectStorageError('Failed to process capture to project', _never);
    }
  }
};
