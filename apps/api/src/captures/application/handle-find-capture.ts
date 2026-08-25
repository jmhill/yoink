import type { ResultAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type { FindCaptureQuery } from '../domain/capture-commands.js';
import type { FindCaptureError } from '../domain/capture-errors.js';
import { loadOwnedCapture } from './load-owned-capture.js';
import type { LoadCapture } from './ports.js';

export type HandleFindCaptureDeps = {
  load: LoadCapture;
};

export const handleFindCapture = (
  query: FindCaptureQuery,
  deps: HandleFindCaptureDeps
): ResultAsync<Capture, FindCaptureError> => {
  return loadOwnedCapture({
    id: query.id,
    organizationId: query.organizationId,
    load: deps.load,
  });
};
