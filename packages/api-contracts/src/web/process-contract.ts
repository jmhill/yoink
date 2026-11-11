import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import { CaptureSchema } from '../schemas/capture.js';
import { TaskSchema } from '../schemas/task.js';
import {
  ProcessCaptureBodySchema,
  ProcessCaptureToProjectResponseSchema,
  ProcessCaptureToProjectSchema,
} from '../schemas/process-capture.js';

const captureId = z.object({
  id: z.string().uuid(),
});

const deletedCount = z.object({
  deletedCount: z.number(),
});

/**
 * Process, trash, and snooze. Paths are the resource after `/web-api`.
 * Inbox list and create stay on `/inbox`. The same writes stay on `/api`
 * and `/api/v1` at their current paths.
 */
export const webProcessContract = oc.router({
  trash: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/captures/{id}/trash',
        summary: 'Move a capture to trash',
      })
    )
    .input(captureId)
    .output(CaptureSchema),
  restore: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/captures/{id}/restore',
        summary: 'Restore a capture from trash',
      })
    )
    .input(captureId)
    .output(CaptureSchema),
  snooze: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/captures/{id}/snooze',
        summary: 'Snooze a capture until a specific time',
      })
    )
    .input(
      captureId.extend({
        until: z.string().datetime(),
      })
    )
    .output(CaptureSchema),
  unsnooze: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/captures/{id}/unsnooze',
        summary: 'Unsnooze a capture',
      })
    )
    .input(captureId)
    .output(CaptureSchema),
  delete: oc
    .meta(
      openapi({
        method: 'DELETE',
        path: '/captures/{id}',
        successStatus: 204,
        summary: 'Permanently delete a capture (must be in trash)',
      })
    )
    .input(captureId)
    .output(z.void()),
  emptyTrash: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/captures/trash/empty',
        summary: 'Permanently delete all captures in trash',
      })
    )
    .input(z.object({}))
    .output(deletedCount),
  process: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/captures/{id}/process',
        successStatus: 201,
        summary: 'Process a capture into a task',
      })
    )
    .input(captureId.merge(ProcessCaptureBodySchema))
    .output(TaskSchema),
  processToProject: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/captures/{id}/process-to-project',
        successStatus: 201,
        summary: 'Process a capture into a project (person only)',
      })
    )
    .input(captureId.merge(ProcessCaptureToProjectSchema))
    .output(ProcessCaptureToProjectResponseSchema),
});
