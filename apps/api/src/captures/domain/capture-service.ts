import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { CaptureStore, FindByOrganizationResult } from './capture-store.js';
import type {
  CreateCaptureCommand,
  ListCapturesQuery,
  FindCaptureQuery,
  UpdateCaptureCommand,
  ArchiveCaptureCommand,
  UnarchiveCaptureCommand,
  PinCaptureCommand,
  UnpinCaptureCommand,
  SnoozeCaptureCommand,
  UnsnoozeCaptureCommand,
} from './capture-commands.js';
import type {
  CreateCaptureError,
  ListCapturesError,
  FindCaptureError,
  UpdateCaptureError,
  ArchiveCaptureError,
  UnarchiveCaptureError,
  PinCaptureError,
  UnpinCaptureError,
  SnoozeCaptureError,
  UnsnoozeCaptureError,
} from './capture-errors.js';
import { captureNotFoundError, captureAlreadyArchivedError, invalidSnoozeTimeError } from './capture-errors.js';

export type CaptureServiceDependencies = {
  store: CaptureStore;
  clock: Clock;
  idGenerator: IdGenerator;
};

export type ListCapturesResult = FindByOrganizationResult;

export type CaptureService = {
  create: (command: CreateCaptureCommand) => ResultAsync<Capture, CreateCaptureError>;
  list: (query: ListCapturesQuery) => ResultAsync<ListCapturesResult, ListCapturesError>;
  findById: (query: FindCaptureQuery) => ResultAsync<Capture, FindCaptureError>;
  update: (command: UpdateCaptureCommand) => ResultAsync<Capture, UpdateCaptureError>;
  // Workflow operations
  archive: (command: ArchiveCaptureCommand) => ResultAsync<Capture, ArchiveCaptureError>;
  unarchive: (command: UnarchiveCaptureCommand) => ResultAsync<Capture, UnarchiveCaptureError>;
  // Display modifier operations
  pin: (command: PinCaptureCommand) => ResultAsync<Capture, PinCaptureError>;
  unpin: (command: UnpinCaptureCommand) => ResultAsync<Capture, UnpinCaptureError>;
  snooze: (command: SnoozeCaptureCommand) => ResultAsync<Capture, SnoozeCaptureError>;
  unsnooze: (command: UnsnoozeCaptureCommand) => ResultAsync<Capture, UnsnoozeCaptureError>;
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

    archive: (command: ArchiveCaptureCommand): ResultAsync<Capture, ArchiveCaptureError> => {
      return findAndValidateOwnership(command.id, command.organizationId).andThen((existing) => {
        // Idempotent: if already archived, just return as-is
        if (existing.status === 'archived') {
          return okAsync(existing);
        }

        const updatedCapture: Capture = {
          ...existing,
          status: 'archived',
          archivedAt: clock.now().toISOString(),
          pinnedAt: undefined, // Archiving clears pin
          snoozedUntil: undefined, // Archiving clears snooze
        };

        return store.update(updatedCapture).map(() => updatedCapture);
      });
    },

    unarchive: (command: UnarchiveCaptureCommand): ResultAsync<Capture, UnarchiveCaptureError> => {
      return findAndValidateOwnership(command.id, command.organizationId).andThen((existing) => {
        // Idempotent: if already in inbox, just return as-is
        if (existing.status === 'inbox') {
          return okAsync(existing);
        }

        const updatedCapture: Capture = {
          ...existing,
          status: 'inbox',
          archivedAt: undefined,
        };

        return store.update(updatedCapture).map(() => updatedCapture);
      });
    },

    pin: (command: PinCaptureCommand): ResultAsync<Capture, PinCaptureError> => {
      return findAndValidateOwnership(command.id, command.organizationId).andThen((existing) => {
        // Can't pin archived captures
        if (existing.status === 'archived') {
          return errAsync(captureAlreadyArchivedError(command.id));
        }

        // Idempotent: if already pinned, just return as-is
        if (existing.pinnedAt) {
          return okAsync(existing);
        }

        const updatedCapture: Capture = {
          ...existing,
          pinnedAt: clock.now().toISOString(),
        };

        return store.update(updatedCapture).map(() => updatedCapture);
      });
    },

    unpin: (command: UnpinCaptureCommand): ResultAsync<Capture, UnpinCaptureError> => {
      return findAndValidateOwnership(command.id, command.organizationId).andThen((existing) => {
        // Idempotent: if already unpinned, just return as-is
        if (!existing.pinnedAt) {
          return okAsync(existing);
        }

        const updatedCapture: Capture = {
          ...existing,
          pinnedAt: undefined,
        };

        return store.update(updatedCapture).map(() => updatedCapture);
      });
    },

    snooze: (command: SnoozeCaptureCommand): ResultAsync<Capture, SnoozeCaptureError> => {
      return findAndValidateOwnership(command.id, command.organizationId).andThen((existing) => {
        // Can't snooze archived captures
        if (existing.status === 'archived') {
          return errAsync(captureAlreadyArchivedError(command.id));
        }

        // Validate snooze time is in the future
        const snoozeTime = new Date(command.until);
        const now = clock.now();
        if (snoozeTime <= now) {
          return errAsync(invalidSnoozeTimeError('Snooze time must be in the future'));
        }

        // Update snooze (keeps pinnedAt unchanged - can be both pinned and snoozed)
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
  };
};
