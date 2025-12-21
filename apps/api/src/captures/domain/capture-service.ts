import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { CaptureStore, FindByOrganizationResult } from './capture-store.js';
import type { CreateCaptureCommand, ListCapturesQuery, FindCaptureQuery, UpdateCaptureCommand } from './capture-commands.js';
import type { CreateCaptureError, ListCapturesError, FindCaptureError, UpdateCaptureError } from './capture-errors.js';
import { captureNotFoundError } from './capture-errors.js';

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
};

export const createCaptureService = (
  deps: CaptureServiceDependencies
): CaptureService => {
  const { store, clock, idGenerator } = deps;

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
        limit: query.limit,
        cursor: query.cursor,
      });
    },

    findById: (query: FindCaptureQuery): ResultAsync<Capture, FindCaptureError> => {
      return store.findById(query.id).andThen((capture) => {
        if (!capture || capture.organizationId !== query.organizationId) {
          return errAsync(captureNotFoundError(query.id));
        }
        return okAsync(capture);
      });
    },

    update: (command: UpdateCaptureCommand): ResultAsync<Capture, UpdateCaptureError> => {
      return store.findById(command.id).andThen((existing) => {
        if (!existing || existing.organizationId !== command.organizationId) {
          return errAsync(captureNotFoundError(command.id));
        }

        const updatedCapture: Capture = {
          ...existing,
          title: command.title ?? existing.title,
          content: command.content ?? existing.content,
          status: command.status ?? existing.status,
          archivedAt: computeArchivedAt(existing, command, clock),
          pinnedAt: computePinnedAt(existing, command, clock),
        };

        return store.update(updatedCapture).map(() => updatedCapture);
      });
    },
  };
};

const computeArchivedAt = (
  existing: Capture,
  command: UpdateCaptureCommand,
  clock: Clock
): string | undefined => {
  const newStatus = command.status ?? existing.status;

  if (newStatus === 'archived' && existing.status !== 'archived') {
    return clock.now().toISOString();
  }

  if (newStatus === 'inbox') {
    return undefined;
  }

  return existing.archivedAt;
};

const computePinnedAt = (
  existing: Capture,
  command: UpdateCaptureCommand,
  clock: Clock
): string | undefined => {
  const newStatus = command.status ?? existing.status;

  // Archiving automatically unpins
  if (newStatus === 'archived') {
    return undefined;
  }

  // Explicit pin request
  if (command.pinned === true && !existing.pinnedAt) {
    return clock.now().toISOString();
  }

  // Explicit unpin request
  if (command.pinned === false) {
    return undefined;
  }

  // No change requested, preserve existing state
  return existing.pinnedAt;
};
