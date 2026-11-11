import { implement } from '@orpc/server';
import type { Capture as ContractCapture } from '@yoink/api-contracts';
import { webProcessContract } from '@yoink/api-contracts/web';
import type { Capture, Captures } from '../../modules/captures/index.js';
import type { CaptureProcessingService } from '../../workflows/processing/index.js';
import type { OrpcHttpContext } from '../_shared/orpc/http-context.js';
import {
  mapDeleteCaptureError,
  mapEmptyTrashError,
  mapProcessCaptureError,
  mapProcessCaptureToProjectError,
  mapRestoreCaptureError,
  mapSnoozeCaptureError,
  mapTrashCaptureError,
  mapUnsnoozeCaptureError,
} from './process-errors.js';

/**
 * Commands this screen calls. Inbox list and create stay on the inbox port.
 */
export type WebProcessCaptures = {
  commands: Pick<
    Captures['commands'],
    | 'trashCapture'
    | 'restoreCapture'
    | 'snoozeCapture'
    | 'unsnoozeCapture'
    | 'deleteCapture'
    | 'emptyTrash'
  >;
};

export type WebProcessDependencies = {
  captures: WebProcessCaptures;
  captureProcessingService: Pick<
    CaptureProcessingService,
    'processCaptureToTask' | 'processCaptureToProject'
  >;
};

/**
 * Copy a capture document onto the contract capture.
 * Optional fields stay absent when the document omits them, which keeps the
 * JSON key order of the document the module already returns.
 */
const toContractCapture = (capture: Capture): ContractCapture => ({
  id: capture.id,
  organizationId: capture.organizationId,
  createdById: capture.createdById,
  content: capture.content,
  ...(capture.title !== undefined ? { title: capture.title } : {}),
  ...(capture.sourceUrl !== undefined ? { sourceUrl: capture.sourceUrl } : {}),
  ...(capture.sourceApp !== undefined ? { sourceApp: capture.sourceApp } : {}),
  status: capture.status,
  capturedAt: capture.capturedAt,
  ...(capture.trashedAt !== undefined ? { trashedAt: capture.trashedAt } : {}),
  ...(capture.snoozedUntil !== undefined ? { snoozedUntil: capture.snoozedUntil } : {}),
  ...(capture.processedAt !== undefined ? { processedAt: capture.processedAt } : {}),
  ...(capture.processedToType !== undefined ? { processedToType: capture.processedToType } : {}),
  ...(capture.processedToId !== undefined ? { processedToId: capture.processedToId } : {}),
});

/**
 * Process, trash, and snooze. Each handler calls one captures command or the
 * processing workflow. The edge copies a capture document onto the contract
 * capture and does not sort. Public v1 and the `/api` alias keep today's
 * paths, status, and error body.
 */
export const createWebProcessHandlers = (deps: WebProcessDependencies) => {
  const processEdge = implement(webProcessContract).$context<OrpcHttpContext>();
  const organizationId = (context: OrpcHttpContext) => context.request.authContext.organizationId;
  const actor = (context: OrpcHttpContext) => context.request.authContext.actor;

  const captures = processEdge.router({
    trash: processEdge.trash.handler(async ({ input, context }) => {
      const result = await deps.captures.commands.trashCapture({
        id: input.id,
        organizationId: organizationId(context),
        actor: actor(context),
      });
      return result.match(
        ({ view }) => toContractCapture(view),
        (error) => {
          throw mapTrashCaptureError(error);
        }
      );
    }),
    restore: processEdge.restore.handler(async ({ input, context }) => {
      const result = await deps.captures.commands.restoreCapture({
        id: input.id,
        organizationId: organizationId(context),
        actor: actor(context),
      });
      return result.match(
        ({ view }) => toContractCapture(view),
        (error) => {
          throw mapRestoreCaptureError(error);
        }
      );
    }),
    snooze: processEdge.snooze.handler(async ({ input, context }) => {
      const result = await deps.captures.commands.snoozeCapture({
        id: input.id,
        organizationId: organizationId(context),
        until: input.until,
        actor: actor(context),
      });
      return result.match(
        ({ view }) => toContractCapture(view),
        (error) => {
          throw mapSnoozeCaptureError(error);
        }
      );
    }),
    unsnooze: processEdge.unsnooze.handler(async ({ input, context }) => {
      const result = await deps.captures.commands.unsnoozeCapture({
        id: input.id,
        organizationId: organizationId(context),
        actor: actor(context),
      });
      return result.match(
        ({ view }) => toContractCapture(view),
        (error) => {
          throw mapUnsnoozeCaptureError(error);
        }
      );
    }),
    delete: processEdge.delete.handler(async ({ input, context }) => {
      const result = await deps.captures.commands.deleteCapture({
        id: input.id,
        organizationId: organizationId(context),
        actor: actor(context),
      });
      return result.match(
        () => undefined,
        (error) => {
          throw mapDeleteCaptureError(error);
        }
      );
    }),
    emptyTrash: processEdge.emptyTrash.handler(async ({ context }) => {
      const result = await deps.captures.commands.emptyTrash({
        organizationId: organizationId(context),
        actor: actor(context),
      });
      return result.match(
        (emptied) => ({ deletedCount: emptied.deletedCount }),
        (error) => {
          throw mapEmptyTrashError(error);
        }
      );
    }),
    process: processEdge.process.handler(async ({ input, context }) => {
      const result = await deps.captureProcessingService.processCaptureToTask({
        id: input.id,
        organizationId: organizationId(context),
        createdById: context.request.authContext.userId,
        title: input.data.title,
        dueDate: input.data.dueDate,
        listId: input.data.listId,
        projectId: input.data.projectId,
        actor: actor(context),
      });
      return result.match(
        (task) => task,
        (error) => {
          throw mapProcessCaptureError(error);
        }
      );
    }),
    processToProject: processEdge.processToProject.handler(async ({ input, context }) => {
      const result = await deps.captureProcessingService.processCaptureToProject({
        id: input.id,
        organizationId: organizationId(context),
        createdById: context.request.authContext.userId,
        name: input.name,
        objective: input.objective,
        status: input.status,
        actor: actor(context),
      });
      return result.match(
        (value) => value,
        (error) => {
          throw mapProcessCaptureToProjectError(error);
        }
      );
    }),
  });

  return captures;
};
