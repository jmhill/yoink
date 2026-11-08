import type { ResultAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type { FindCaptureQuery } from '../../domain/messages/capture-commands.js';
import type { FindCaptureError } from '../../domain/messages/capture-errors.js';
import type { CaptureRuntime } from '../ports.js';
import { loadOwnedCapture } from '../support/load-owned-capture.js';

export const handleFindCapture = (
  query: FindCaptureQuery,
  deps: CaptureRuntime
): ResultAsync<Capture, FindCaptureError> => {
  return loadOwnedCapture({
    id: query.id,
    organizationId: query.organizationId,
    load: deps.load,
  });
};
