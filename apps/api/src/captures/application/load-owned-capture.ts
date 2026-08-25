import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import { captureNotFoundError, type FindCaptureError } from '../domain/capture-errors.js';
import type { LoadCapture } from './ports.js';

export const loadOwnedCapture = (input: {
  id: string;
  organizationId: string;
  load: LoadCapture;
}): ResultAsync<Capture, FindCaptureError> => {
  return input.load(input.id).andThen((capture) => {
    if (!capture || capture.organizationId !== input.organizationId) {
      return errAsync(captureNotFoundError(input.id));
    }
    return okAsync(capture);
  });
};
