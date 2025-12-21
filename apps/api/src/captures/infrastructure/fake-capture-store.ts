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

    findById: (id: string): ResultAsync<Capture | null, StorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(storageError('Find failed'));
      }
      const found = captures.find((c) => c.id === id);
      return okAsync(found ?? null);
    },

    update: (capture: Capture): ResultAsync<void, StorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(storageError('Update failed'));
      }
      const index = captures.findIndex((c) => c.id === capture.id);
      if (index !== -1) {
        captures[index] = capture;
      }
      return okAsync(undefined);
    },

    findByOrganization: (
      opts: FindByOrganizationOptions
    ): ResultAsync<FindByOrganizationResult, StorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(storageError('Find failed'));
      }

      const isSnoozed = (c: Capture): boolean => {
        if (!c.snoozedUntil || !opts.now) return false;
        return new Date(c.snoozedUntil) > new Date(opts.now);
      };

      let filtered = captures
        .filter((c) => c.organizationId === opts.organizationId)
        .filter((c) => !opts.status || c.status === opts.status);

      // Handle snoozed filtering
      if (opts.snoozed !== undefined && opts.now) {
        if (opts.snoozed) {
          // Only snoozed items
          filtered = filtered.filter(isSnoozed);
        } else {
          // Exclude snoozed items
          filtered = filtered.filter((c) => !isSnoozed(c));
        }
      }

      // Sort based on view type
      if (opts.snoozed === true) {
        // Snoozed view: sort by snoozedUntil ASC (soonest first)
        filtered = filtered.sort((a, b) => {
          const aTime = new Date(a.snoozedUntil!).getTime();
          const bTime = new Date(b.snoozedUntil!).getTime();
          return aTime - bTime;
        });
      } else {
        // Inbox/archived: Pinned captures first
        filtered = filtered.sort((a, b) => {
          const aPinned = a.pinnedAt ? 1 : 0;
          const bPinned = b.pinnedAt ? 1 : 0;
          if (aPinned !== bPinned) {
            return bPinned - aPinned; // Pinned first
          }
          // Within pinned, sort by pinnedAt DESC
          if (a.pinnedAt && b.pinnedAt) {
            return new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime();
          }
          // Within unpinned, sort by capturedAt DESC
          return new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime();
        });
      }

      filtered = filtered.slice(0, opts.limit ?? Infinity);
      return okAsync({ captures: filtered });
    },

  };
};
