import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { CaptureSchema, CreateCaptureSchema } from '../../schemas/capture.js';
import { CaptureListPageSchema } from '../../schemas/list-page.js';
import { CaptureListQuerySchema } from '../../schemas/process-capture.js';

/**
 * Query values are JSON-parsed. Otherwise they stay strings, and
 * `z.coerce.boolean()` turns `"false"` into `true`.
 */
const captureListQueryStyles = {
  limit: 'json',
  cursor: 'json',
  status: 'json',
  snoozed: 'json',
} as const;

/**
 * What the extension inventory uses: capture create and list.
 * Paths are the resource after `/extension-api/v1`. The mount passes that prefix to `handle`.
 */
export const extensionApiV1Contract = oc.router({
  create: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/captures',
        successStatus: 201,
        summary: 'Create a capture from the browser extension',
      })
    )
    .input(CreateCaptureSchema)
    .output(CaptureSchema),
  list: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/captures',
        summary: 'List captures for the browser extension',
        queryStyles: captureListQueryStyles,
      })
    )
    .input(CaptureListQuerySchema)
    .output(CaptureListPageSchema),
});
