import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import {
  CaptureSchema,
  CreateCaptureSchema,
  UpdateCaptureSchema,
} from '../schemas/capture.js';
import { CaptureListPageSchema } from '../schemas/list-page.js';
import { TaskSchema } from '../schemas/task.js';
import {
  CaptureListQuerySchema,
  ProcessCaptureBodySchema,
  ProcessCaptureToProjectResponseSchema,
  ProcessCaptureToProjectSchema,
} from '../contracts/capture-contract.js';

/**
 * ts-rest parses query values with JSON.parse (`jsonQuery: true`).
 * oRPC otherwise leaves them as strings, and `z.coerce.boolean()` turns the
 * string `"false"` into `true`. `json` style is the same parse-or-keep-string rule.
 */
const captureListQueryStyles = {
  limit: 'json',
  cursor: 'json',
  status: 'json',
  snoozed: 'json',
} as const;

const captureId = z.object({
  id: z.string().uuid(),
});

const deletedCount = z.object({
  deletedCount: z.number(),
});

export const captureOrpcContract = oc.router({
  create: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/captures',
        successStatus: 201,
        summary: 'Create a new capture',
      })
    )
    .input(CreateCaptureSchema)
    .output(CaptureSchema),
  list: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/captures',
        summary: 'List captures',
        queryStyles: captureListQueryStyles,
      })
    )
    .input(CaptureListQuerySchema)
    .output(CaptureListPageSchema),
  get: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/captures/{id}',
        summary: 'Get a capture by ID',
      })
    )
    .input(captureId)
    .output(CaptureSchema),
  update: oc
    .meta(
      openapi({
        method: 'PATCH',
        path: '/api/captures/{id}',
        summary: 'Update a capture (content only)',
      })
    )
    .input(captureId.merge(UpdateCaptureSchema))
    .output(CaptureSchema),
  trash: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/captures/{id}/trash',
        summary: 'Move a capture to trash',
      })
    )
    .input(captureId)
    .output(CaptureSchema),
  restore: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/captures/{id}/restore',
        summary: 'Restore a capture from trash',
      })
    )
    .input(captureId)
    .output(CaptureSchema),
  snooze: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/captures/{id}/snooze',
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
        path: '/api/captures/{id}/unsnooze',
        summary: 'Unsnooze a capture',
      })
    )
    .input(captureId)
    .output(CaptureSchema),
  delete: oc
    .meta(
      openapi({
        method: 'DELETE',
        path: '/api/captures/{id}',
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
        path: '/api/captures/trash/empty',
        summary: 'Permanently delete all captures in trash',
      })
    )
    .input(z.object({}))
    .output(deletedCount),
  process: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/captures/{id}/process',
        successStatus: 201,
        summary: 'Process a capture into a task (or note in the future)',
      })
    )
    .input(captureId.merge(ProcessCaptureBodySchema))
    .output(TaskSchema),
});

export const processCaptureToProjectOrpcContract = oc.router({
  processToProject: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/captures/{id}/process-to-project',
        successStatus: 201,
        summary: 'Process a capture into a project (person only)',
      })
    )
    .input(captureId.merge(ProcessCaptureToProjectSchema))
    .output(ProcessCaptureToProjectResponseSchema),
});
