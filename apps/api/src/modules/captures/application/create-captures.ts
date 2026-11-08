import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type { Actor } from '../../../kernel/auth-context.js';
import type { Work } from '../../../kernel/unit-of-work.js';
import type {
  CreateCaptureCommand,
  DeleteCaptureCommand,
  EmptyTrashCommand,
  FindCaptureQuery,
  ListCapturesQuery,
  RestoreCaptureCommand,
  SnoozeCaptureCommand,
  TrashCaptureCommand,
  UnsnoozeCaptureCommand,
  UpdateCaptureCommand,
} from '../domain/messages/capture-commands.js';
import {
  captureNotInInboxError,
  type CaptureNotInInboxError,
  type FindCaptureError,
} from '../domain/messages/capture-errors.js';
import type { CaptureDeleted } from '../domain/messages/events.js';
import {
  planCaptureSoftDelete,
  planMarkProcessed,
} from '../domain/projections/plan-capture.js';
import { handleCreateCapture } from './handlers/handle-create-capture.js';
import { handleDeleteCapture } from './handlers/handle-delete-capture.js';
import { handleEmptyTrash } from './handlers/handle-empty-trash.js';
import { handleFindCapture } from './handlers/handle-find-capture.js';
import { handleListCaptures } from './handlers/handle-list-captures.js';
import { handleRestoreCapture } from './handlers/handle-restore-capture.js';
import { handleSnoozeCapture } from './handlers/handle-snooze-capture.js';
import { handleTrashCapture } from './handlers/handle-trash-capture.js';
import { handleUnsnoozeCapture } from './handlers/handle-unsnooze-capture.js';
import { handleUpdateCapture } from './handlers/handle-update-capture.js';
import {
  captureProcessedIntegrationEvent,
  toCaptureIntegrationEvent,
} from './integration-events/to-capture-integration-event.js';
import type { CaptureRuntime } from './ports.js';
import { captureWork } from './support/commit-capture.js';
import { loadOwnedCapture } from './support/load-owned-capture.js';

export type MarkProcessedInput = {
  captureId: string;
  organizationId: string;
  to: { readonly kind: 'task' | 'project'; readonly id: string };
  actor: Actor;
};

export type DeleteProcessedCaptureInput = {
  captureId: string;
  organizationId: string;
  actor: Actor;
};

export type Captures = {
  commands: {
    createCapture: (command: CreateCaptureCommand) => ReturnType<typeof handleCreateCapture>;
    updateCapture: (command: UpdateCaptureCommand) => ReturnType<typeof handleUpdateCapture>;
    trashCapture: (command: TrashCaptureCommand) => ReturnType<typeof handleTrashCapture>;
    restoreCapture: (command: RestoreCaptureCommand) => ReturnType<typeof handleRestoreCapture>;
    snoozeCapture: (command: SnoozeCaptureCommand) => ReturnType<typeof handleSnoozeCapture>;
    unsnoozeCapture: (command: UnsnoozeCaptureCommand) => ReturnType<typeof handleUnsnoozeCapture>;
    deleteCapture: (command: DeleteCaptureCommand) => ReturnType<typeof handleDeleteCapture>;
    emptyTrash: (command: EmptyTrashCommand) => ReturnType<typeof handleEmptyTrash>;
  };
  queries: {
    findCapture: (query: FindCaptureQuery) => ReturnType<typeof handleFindCapture>;
    listCaptures: (query: ListCapturesQuery) => ReturnType<typeof handleListCaptures>;
    findInboxCapture: (
      captureId: string,
      organizationId: string
    ) => ResultAsync<Capture, FindCaptureError | CaptureNotInInboxError>;
  };
  prepare: {
    markProcessed: (
      input: MarkProcessedInput
    ) => ResultAsync<Work<Capture>, FindCaptureError | CaptureNotInInboxError>;
    deleteProcessedCapture: (
      input: DeleteProcessedCaptureInput
    ) => ResultAsync<Work<CaptureDeleted>, FindCaptureError>;
  };
};

const findInboxCapture = (
  deps: CaptureRuntime,
  captureId: string,
  organizationId: string
): ResultAsync<Capture, FindCaptureError | CaptureNotInInboxError> =>
  loadOwnedCapture({ id: captureId, organizationId, load: deps.load }).andThen((capture) => {
    if (capture.status !== 'inbox') {
      return errAsync(captureNotInInboxError(captureId));
    }
    return okAsync(capture);
  });

export const createCaptures = (deps: CaptureRuntime): Captures => ({
  commands: {
    createCapture: (command) => handleCreateCapture(command, deps),
    updateCapture: (command) => handleUpdateCapture(command, deps),
    trashCapture: (command) => handleTrashCapture(command, deps),
    restoreCapture: (command) => handleRestoreCapture(command, deps),
    snoozeCapture: (command) => handleSnoozeCapture(command, deps),
    unsnoozeCapture: (command) => handleUnsnoozeCapture(command, deps),
    deleteCapture: (command) => handleDeleteCapture(command, deps),
    emptyTrash: (command) => handleEmptyTrash(command, deps),
  },
  queries: {
    findCapture: (query) => handleFindCapture(query, deps),
    listCaptures: (query) => handleListCaptures(query, deps),
    findInboxCapture: (captureId, organizationId) =>
      findInboxCapture(deps, captureId, organizationId),
  },
  prepare: {
    markProcessed: (input) =>
      findInboxCapture(deps, input.captureId, input.organizationId).map((current) => {
        const occurredAt = deps.now();
        const view: Capture = {
          ...current,
          status: 'processed',
          processedAt: occurredAt,
          processedToType: input.to.kind,
          processedToId: input.to.id,
        };
        return captureWork({
          result: view,
          plan: planMarkProcessed({
            id: current.id,
            organizationId: current.organizationId,
            processedAt: occurredAt,
            processedToType: input.to.kind,
            processedToId: input.to.id,
          }),
          event: captureProcessedIntegrationEvent({
            id: deps.ids.generate(),
            captureId: current.id,
            organizationId: current.organizationId,
            occurredAt,
            actor: input.actor,
            processedToType: input.to.kind,
            processedToId: input.to.id,
          }),
        });
      }),
    deleteProcessedCapture: (input) =>
      loadOwnedCapture({
        id: input.captureId,
        organizationId: input.organizationId,
        load: deps.load,
      }).map((current) => {
        const occurredAt = deps.now();
        const event: CaptureDeleted = {
          type: 'CaptureDeleted',
          id: current.id,
          organizationId: current.organizationId,
        };
        return captureWork({
          result: event,
          plan: planCaptureSoftDelete({
            id: current.id,
            organizationId: current.organizationId,
            deletedAt: occurredAt,
          }),
          event: toCaptureIntegrationEvent({
            event,
            id: deps.ids.generate(),
            occurredAt,
            actor: input.actor,
          }),
        });
      }),
  },
});
