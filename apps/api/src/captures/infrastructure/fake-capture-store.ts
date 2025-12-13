import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type {
  CaptureStore,
  FindByOrganizationOptions,
  FindByOrganizationResult,
} from '../domain/capture-store.js';
import { storageError, type StorageError } from '../domain/capture-errors.js';

export type FakeCaptureStoreOptions = {
  shouldFailOnSave?: boolean;
  shouldFailOnFind?: boolean;
  initialCaptures?: Capture[];
};

export const createFakeCaptureStore = (
  options: FakeCaptureStoreOptions = {}
): CaptureStore => {
  const captures: Capture[] = [...(options.initialCaptures ?? [])];

  return {
    save: (capture: Capture): ResultAsync<void, StorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(storageError('Save failed'));
      }
      captures.push(capture);
      return okAsync(undefined);
    },

    findByOrganization: (
      opts: FindByOrganizationOptions
    ): ResultAsync<FindByOrganizationResult, StorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(storageError('Find failed'));
      }
      const filtered = captures
        .filter((c) => c.organizationId === opts.organizationId)
        .filter((c) => !opts.status || c.status === opts.status)
        .sort(
          (a, b) =>
            new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
        )
        .slice(0, opts.limit ?? Infinity);
      return okAsync({ captures: filtered });
    },

  };
};
