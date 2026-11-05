import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import {
  CaptureListPageSchema,
  CaptureListQuerySchema,
  CaptureSchema,
  CreateCaptureSchema,
} from '@yoink/api-contracts';

/**
 * ts-rest parses these query values with JSON.parse (`jsonQuery: true`).
 * oRPC otherwise leaves them as strings, and `z.coerce.boolean()` turns the
 * string `"false"` into `true`. `json` style is the same parse-or-keep-string rule.
 */
const captureListQueryStyles = {
  limit: 'json',
  cursor: 'json',
  status: 'json',
  snoozed: 'json',
} as const;

export const captureIngressContract = oc.router({
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
});
