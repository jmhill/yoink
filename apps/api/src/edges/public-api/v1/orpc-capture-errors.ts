import { ORPCError } from '@orpc/server';
import type { PrincipalKind } from '../../../kernel/auth-context.js';
import { yoinkHttpError, yoinkServerError } from '../../_shared/orpc/yoink-http-error.js';
import type { ProcessCaptureToProjectError } from '../../../processing/application/handle-process-to-project.js';
import type { ProcessCaptureToTaskError } from '../../../processing/application/handle-process-to-task.js';
import type {
  CreateCaptureError,
  DeleteCaptureError,
  EmptyTrashError,
  FindCaptureError,
  ListCapturesError,
  RestoreCaptureError,
  SnoozeCaptureError,
  TrashCaptureError,
  UnsnoozeCaptureError,
  UpdateCaptureError,
} from '../../../modules/captures/index.js';

const notFound = (cause: unknown) =>
  yoinkHttpError({
    code: 'NOT_FOUND',
    message: 'Capture not found',
    cause,
  });

export const mapAgentCaptureRefusal = (principalKind: PrincipalKind) => {
  switch (principalKind) {
    case 'agent':
      return new ORPCError('FORBIDDEN', {
        message: 'Agents cannot create captures',
      });
    case 'human':
      return undefined;
    default: {
      const _never: never = principalKind;
      void _never;
      return undefined;
    }
  }
};

export const mapCreateCaptureError = (error: CreateCaptureError) => {
  switch (error.type) {
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to create capture', error);
  }
};

export const mapListCapturesError = (error: ListCapturesError) => {
  switch (error.type) {
    case 'INVALID_CURSOR':
      return new ORPCError('INVALID_CURSOR', {
        message: error.message,
        cause: error,
      });
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to list captures', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to list captures', _never);
    }
  }
};

export const mapFindCaptureError = (error: FindCaptureError) => {
  switch (error.type) {
    case 'CAPTURE_NOT_FOUND':
      return notFound(error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to get capture', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to get capture', _never);
    }
  }
};

export const mapUpdateCaptureError = (error: UpdateCaptureError) => {
  switch (error.type) {
    case 'CAPTURE_NOT_FOUND':
      return notFound(error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to update capture', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to update capture', _never);
    }
  }
};

export const mapTrashCaptureError = (error: TrashCaptureError) => {
  switch (error.type) {
    case 'CAPTURE_NOT_FOUND':
      return notFound(error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to trash capture', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to trash capture', _never);
    }
  }
};

export const mapRestoreCaptureError = (error: RestoreCaptureError) => {
  switch (error.type) {
    case 'CAPTURE_NOT_FOUND':
      return notFound(error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to restore capture', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to restore capture', _never);
    }
  }
};

export const mapSnoozeCaptureError = (error: SnoozeCaptureError) => {
  switch (error.type) {
    case 'CAPTURE_NOT_FOUND':
      return notFound(error);
    case 'CAPTURE_ALREADY_TRASHED':
      return yoinkHttpError({
        code: 'BAD_REQUEST',
        message: 'Cannot snooze a trashed capture',
        cause: error,
      });
    case 'INVALID_SNOOZE_TIME':
      return yoinkHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        cause: error,
      });
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to snooze capture', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to snooze capture', _never);
    }
  }
};

export const mapUnsnoozeCaptureError = (error: UnsnoozeCaptureError) => {
  switch (error.type) {
    case 'CAPTURE_NOT_FOUND':
      return notFound(error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to unsnooze capture', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to unsnooze capture', _never);
    }
  }
};

export const mapDeleteCaptureError = (error: DeleteCaptureError) => {
  switch (error.type) {
    case 'CAPTURE_NOT_FOUND':
      return notFound(error);
    case 'CAPTURE_NOT_IN_TRASH':
      return yoinkHttpError({
        code: 'CONFLICT',
        message: 'Capture must be in trash before it can be deleted',
        cause: error,
      });
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to delete capture', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to delete capture', _never);
    }
  }
};

export const mapEmptyTrashError = (error: EmptyTrashError) => {
  switch (error.type) {
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to empty trash', error);
  }
};

export const mapProcessCaptureError = (error: ProcessCaptureToTaskError) => {
  switch (error.type) {
    case 'CAPTURE_NOT_FOUND':
      return notFound(error);
    case 'CAPTURE_NOT_IN_INBOX':
      return yoinkHttpError({
        code: 'BAD_REQUEST',
        message: 'Capture must be in inbox to be processed',
        cause: error,
      });
    case 'LIST_NOT_IN_ORGANIZATION':
      return yoinkHttpError({
        code: 'BAD_REQUEST',
        message: 'List is not in this organization',
        cause: error,
      });
    case 'PROJECT_NOT_IN_ORGANIZATION':
      return yoinkHttpError({
        code: 'NOT_FOUND',
        message: 'Project not found',
        cause: error,
      });
    case 'PROJECT_DONE':
      return yoinkHttpError({
        code: 'BAD_REQUEST',
        message: 'Cannot add a task to a done project',
        cause: error,
      });
    case 'PROJECT_PROPOSED':
      return yoinkHttpError({
        code: 'BAD_REQUEST',
        message: 'A proposed project cannot have tasks',
        cause: error,
      });
    case 'ASSIGNEE_NOT_IN_ORGANIZATION':
      return yoinkHttpError({
        code: 'BAD_REQUEST',
        message: 'Assignee is not a member of this organization',
        cause: error,
      });
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to process capture', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to process capture', _never);
    }
  }
};

export const mapProcessCaptureToProjectError = (error: ProcessCaptureToProjectError) => {
  switch (error.type) {
    case 'PROJECT_CREATE_REQUIRES_PERSON':
      return yoinkHttpError({
        code: 'FORBIDDEN',
        message: error.message,
        bodyCode: error.type,
        cause: error,
      });
    case 'DUPLICATE_PROJECT_NAME':
    case 'CAPTURE_NOT_IN_INBOX':
      return yoinkHttpError({
        code: 'CONFLICT',
        message:
          error.type === 'CAPTURE_NOT_IN_INBOX'
            ? 'Capture must be in the inbox'
            : error.message,
        bodyCode: error.type,
        cause: error,
      });
    case 'CAPTURE_NOT_FOUND':
      return yoinkHttpError({
        code: 'NOT_FOUND',
        message: 'Capture not found',
        bodyCode: error.type,
        cause: error,
      });
    case 'PROJECT_NAME_BLANK':
    case 'INVALID_PROJECT_NAME':
      return yoinkHttpError({
        code: 'BAD_REQUEST',
        message: error.message,
        bodyCode: error.type,
        cause: error,
      });
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to process capture into a project', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to process capture into a project', _never);
    }
  }
};
