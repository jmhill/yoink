import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { CaptureStore, FindByOrganizationResult } from './capture-store.js';
import type {
  CreateCaptureCommand,
  ListCapturesQuery,
  FindCaptureQuery,
  UpdateCaptureCommand,
  TrashCaptureCommand,
  RestoreCaptureCommand,
  SnoozeCaptureCommand,
  UnsnoozeCaptureCommand,
  DeleteCaptureCommand,
  EmptyTrashCommand,
} from './capture-commands.js';
import type {
  CreateCaptureError,
  ListCapturesError,
  FindCaptureError,
  UpdateCaptureError,
  TrashCaptureError,
  RestoreCaptureError,
  SnoozeCaptureError,
  UnsnoozeCaptureError,
  DeleteCaptureError,
  EmptyTrashError,
} from './capture-errors.js';
import { captureNotFoundError, captureAlreadyTrashedError, invalidSnoozeTimeError, captureNotInTrashError } from './capture-errors.js';

export type CaptureServiceDependencies = {
  store: CaptureStore;
  clock: Clock;
  idGenerator: IdGenerator;
};

export type ListCapturesResult = FindByOrganizationResult;

export type EmptyTrashResult = {
  deletedCount: number;
};

export type CaptureService = {
  create: (command: CreateCaptureCommand) => ResultAsync<Capture, CreateCaptureError>;
  list: (query: ListCapturesQuery) => ResultAsync<ListCapturesResult, ListCapturesError>;
  find: (query: FindCaptureQuery) => ResultAsync<Capture, FindCaptureError>;
  findById: (query: FindCaptureQuery) => ResultAsync<Capture, FindCaptureError>;
  update: (command: UpdateCaptureCommand) => ResultAsync<Capture, UpdateCaptureError>;
  // Workflow operations
  trash: (command: TrashCaptureCommand) => ResultAsync<Capture, TrashCaptureError>;
  restore: (command: RestoreCaptureCommand) => ResultAsync<Capture, RestoreCaptureError>;
  // Display modifier operations
  snooze: (command: SnoozeCaptureCommand) => ResultAsync<Capture, SnoozeCaptureError>;
  unsnooze: (command: UnsnoozeCaptureCommand) => ResultAsync<Capture, UnsnoozeCaptureError>;
  // Deletion operations
  delete: (command: DeleteCaptureCommand) => ResultAsync<void, DeleteCaptureError>;
  emptyTrash: (command: EmptyTrashCommand) => ResultAsync<EmptyTrashResult, EmptyTrashError>;
};

export const createCaptureService = (
  deps: CaptureServiceDependencies
): CaptureService => {
  const { store, clock, idGenerator } = deps;

  const findAndValidateOwnership = (
    id: string,
    organizationId: string
  ): ResultAsync<Capture, FindCaptureError> => {
    return store.findById(id).andThen((capture) => {
      if (!capture || capture.organizationId !== organizationId) {
        return errAsync(captureNotFoundError(id));
      }
      return okAsync(capture);
    });
  };

  return {
    create: (command: CreateCaptureCommand): ResultAsync<Capture, CreateCaptureError> => {
      const capture: Capture = {
        id: idGenerator.generate(),
        organizationId: command.organizationId,
        createdById: command.createdById,
        content: command.content,
        title: command.title,
        sourceUrl: command.sourceUrl,
        sourceApp: command.sourceApp,
        status: 'inbox',
        capturedAt: clock.now().toISOString(),
      };

      return store.save(capture).map(() => capture);
    },

    list: (query: ListCapturesQuery): ResultAsync<ListCapturesResult, ListCapturesError> => {
      return store.findByOrganization({
        organizationId: query.organizationId,
        status: query.status,
        snoozed: query.snoozed,
        now: clock.now().toISOString(),
        limit: query.limit,
        cursor: query.cursor,
      });
    },

    find: (query: FindCaptureQuery): ResultAsync<Capture, FindCaptureError> => {
      return findAndValidateOwnership(query.id, query.organizationId);
    },

    findById: (query: FindCaptureQuery): ResultAsync<Capture, FindCaptureError> => {
      return findAndValidateOwnership(query.id, query.organizationId);
    },

    update: (command: UpdateCaptureCommand): ResultAsync<Capture, UpdateCaptureError> => {
      return findAndValidateOwnership(command.id, command.organizationId).andThen((existing) => {
        const updatedCapture: Capture = {
          ...existing,
          title: command.title ?? existing.title,
          content: command.content ?? existing.content,
        };

        return store.update(updatedCapture).map(() => updatedCapture);
      });
    },

    trash: (command: TrashCaptureCommand): ResultAsync<Capture, TrashCaptureError> => {
      return findAndValidateOwnership(command.id, command.organizationId).andThen((existing) => {
        // Idempotent: if already trashed, just return as-is
        if (existing.status === 'trashed') {
          return okAsync(existing);
        }

        const updatedCapture: Capture = {
          ...existing,
          status: 'trashed',
          trashedAt: clock.now().toISOString(),
          snoozedUntil: undefined, // Trashing clears snooze
        };

        return store.update(updatedCapture).map(() => updatedCapture);
      });
    },

    restore: (command: RestoreCaptureCommand): ResultAsync<Capture, RestoreCaptureError> => {
      return findAndValidateOwnership(command.id, command.organizationId).andThen((existing) => {
        // Idempotent: if already in inbox, just return as-is
        if (existing.status === 'inbox') {
          return okAsync(existing);
        }

        const updatedCapture: Capture = {
          ...existing,
          status: 'inbox',
          trashedAt: undefined,
        };

        return store.update(updatedCapture).map(() => updatedCapture);
      });
    },

    snooze: (command: SnoozeCaptureCommand): ResultAsync<Capture, SnoozeCaptureError> => {
      return findAndValidateOwnership(command.id, command.organizationId).andThen((existing) => {
        // Can't snooze trashed captures
        if (existing.status === 'trashed') {
          return errAsync(captureAlreadyTrashedError(command.id));
        }

        // Validate snooze time is in the future
        const snoozeTime = new Date(command.until);
        const now = clock.now();
        if (snoozeTime <= now) {
          return errAsync(invalidSnoozeTimeError('Snooze time must be in the future'));
        }

        const updatedCapture: Capture = {
          ...existing,
          snoozedUntil: command.until,
        };

        return store.update(updatedCapture).map(() => updatedCapture);
      });
    },

    unsnooze: (command: UnsnoozeCaptureCommand): ResultAsync<Capture, UnsnoozeCaptureError> => {
      return findAndValidateOwnership(command.id, command.organizationId).andThen((existing) => {
        // Idempotent: if not snoozed, just return as-is
        if (!existing.snoozedUntil) {
          return okAsync(existing);
        }

        const updatedCapture: Capture = {
          ...existing,
          snoozedUntil: undefined,
        };

        return store.update(updatedCapture).map(() => updatedCapture);
      });
    },

    delete: (command: DeleteCaptureCommand): ResultAsync<void, DeleteCaptureError> => {
      return findAndValidateOwnership(command.id, command.organizationId).andThen((existing) => {
        // Can only delete captures that are in trash
        if (existing.status !== 'trashed') {
          return errAsync(captureNotInTrashError(command.id));
        }

        return store.softDelete(command.id);
      });
    },

    emptyTrash: (command: EmptyTrashCommand): ResultAsync<EmptyTrashResult, EmptyTrashError> => {
      return store.softDeleteTrashed(command.organizationId).map((deletedCount) => ({
        deletedCount,
      }));
    },
  };
};
