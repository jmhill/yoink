import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { CaptureSchema, CreateCaptureSchema } from '../schemas/capture.js';
import { CaptureListPageSchema } from '../schemas/list-page.js';
import { CaptureListQuerySchema } from '../schemas/process-capture.js';

/**
 * Query values are JSON-parsed. Otherwise they stay strings, and
 * `z.coerce.boolean()` turns `"false"` into `true`.
 */
const inboxQueryStyles = {
  limit: 'json',
  cursor: 'json',
  status: 'json',
  snoozed: 'json',
} as const;

/**
 * Inbox list and create. Paths are the resource after `/web-api`.
 * The mount passes that prefix to `handle`.
 */
export const webInboxContract = oc.router({
  create: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/inbox',
        successStatus: 201,
        summary: 'Add a capture to the Inbox',
      })
    )
    .input(CreateCaptureSchema)
    .output(CaptureSchema),
  list: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/inbox',
        summary: 'List Inbox captures',
        queryStyles: inboxQueryStyles,
      })
    )
    .input(CaptureListQuerySchema)
    .output(CaptureListPageSchema),
});
