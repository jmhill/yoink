import { err, ok, okAsync, errAsync, type Result, type ResultAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type {
  CaptureStore,
  FindByOrganizationOptions,
  MarkAsProcessedOptions,
  MarkAsProcessedError,
} from '../persistence/capture-store.js';
import { storageError, captureNotInInboxError, type StorageError } from '../../domain/messages/capture-errors.js';
import { compareKeyset, pageOrdered } from '../../../../kernel/listing/domain/keyset-window.js';
import {
  captureFeedDirection,
  captureFeedKeys,
  snoozedCaptureDirection,
  snoozedCaptureKeys,
} from '../../../../kernel/listing/domain/list-keys.js';
import type { KeysetRows } from '../../../../kernel/listing/domain/listed-page.js';
import { storageFailure, type StepFailure } from '../../../../kernel/unit-of-work.js';
import type { CapturePlan } from '../../domain/projections/plan-capture.js';

export type FakeCaptureStoreOptions = {
  shouldFailOnSave?: boolean;
  shouldFailOnFind?: boolean;
  initialCaptures?: Capture[];
};

export type FakeCaptureStore = CaptureStore & {
  captureSnapshot: () => () => void;
  applySoftDelete: (id: string) => void;
  applyPlan: (plan: CapturePlan) => Result<void, StepFailure>;
  countTrashed: (organizationId: string) => number;
};

export const createFakeCaptureStore = (
  options: FakeCaptureStoreOptions = {}
): FakeCaptureStore => {
  const captures: Capture[] = [...(options.initialCaptures ?? [])];

  return {
    captureSnapshot: () => {
      const copy = captures.map((capture) => ({ ...capture }));
      return () => {
        captures.length = 0;
        captures.push(...copy);
      };
    },
    applySoftDelete: (id: string) => {
      const index = captures.findIndex((capture) => capture.id === id);
      if (index !== -1) {
        captures.splice(index, 1);
      }
    },
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
    ): ResultAsync<KeysetRows<Capture>, StorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(storageError('Find failed'));
      }

      const isSnoozed = (c: Capture): boolean => {
        if (!c.snoozedUntil || !opts.now) return false;
        return c.snoozedUntil > opts.now;
      };

      let filtered = captures
        .filter((c) => c.organizationId === opts.organizationId)
        .filter((c) => !opts.status || c.status === opts.status);

      if (opts.snoozed !== undefined && opts.now) {
        if (opts.snoozed) {
          filtered = filtered.filter(isSnoozed);
        } else {
          filtered = filtered.filter((c) => !isSnoozed(c));
        }
      }

      const snoozedView = opts.snoozed === true;
      const keysOf = snoozedView ? snoozedCaptureKeys : captureFeedKeys;
      const direction = snoozedView ? snoozedCaptureDirection : captureFeedDirection;
      const ordered = [...filtered].sort((a, b) => {
        const cmp = compareKeyset(keysOf(a), keysOf(b));
        return direction === 'asc' ? cmp : -cmp;
      });

      return okAsync(
        pageOrdered({
          ordered,
          keysOf,
          direction,
          fetchLimit: opts.fetchLimit,
          seek: opts.seek,
        })
      );
    },

    softDelete: (id: string): ResultAsync<void, StorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(storageError('Delete failed'));
      }
      // Mark as deleted by removing from array (fake implementation)
      // In real implementation, this would set deletedAt timestamp
      const index = captures.findIndex((c) => c.id === id);
      if (index !== -1) {
        captures.splice(index, 1);
      }
      return okAsync(undefined);
    },

    softDeleteTrashed: (organizationId: string): ResultAsync<number, StorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(storageError('Empty trash failed'));
      }
      // Remove all trashed captures for the organization
      const initialLength = captures.length;
      const trashedIds = captures
        .filter((c) => c.organizationId === organizationId && c.status === 'trashed')
        .map((c) => c.id);
      
      for (const id of trashedIds) {
        const index = captures.findIndex((c) => c.id === id);
        if (index !== -1) {
          captures.splice(index, 1);
        }
      }
      
      return okAsync(initialLength - captures.length);
    },

    countTrashed: (organizationId: string) =>
      captures.filter(
        (capture) => capture.organizationId === organizationId && capture.status === 'trashed'
      ).length,
    applyPlan: (plan: CapturePlan): Result<void, StepFailure> => {
      if (options.shouldFailOnSave) {
        return err(storageFailure(['captures'], 'execute-failed'));
      }
      for (const write of plan.writes) {
        if (write.op === 'insert') {
          captures.push(write.capture);
          continue;
        }
        if (write.op === 'update') {
          const index = captures.findIndex((capture) => capture.id === write.capture.id);
          if (index !== -1) {
            captures[index] = write.capture;
          }
          continue;
        }
        if (write.op === 'soft-delete') {
          const index = captures.findIndex(
            (capture) =>
              capture.id === write.id && capture.organizationId === write.organizationId
          );
          if (index !== -1) {
            captures.splice(index, 1);
          }
          continue;
        }
        if (write.op === 'empty-trash') {
          for (let index = captures.length - 1; index >= 0; index -= 1) {
            const capture = captures[index];
            if (
              capture !== undefined &&
              capture.organizationId === write.organizationId &&
              capture.status === 'trashed'
            ) {
              captures.splice(index, 1);
            }
          }
          continue;
        }
        const index = captures.findIndex(
          (capture) =>
            capture.id === write.id && capture.organizationId === write.organizationId
        );
        const current = index === -1 ? undefined : captures[index];
        if (current === undefined || current.status !== 'inbox') {
          return err({ kind: 'Conflict', owner: 'captures', reason: 'guard-miss' });
        }
        captures[index] = {
          ...current,
          status: 'processed',
          processedAt: write.processedAt,
          processedToType: write.processedToType as Capture['processedToType'],
          processedToId: write.processedToId,
        };
      }
      return ok(undefined);
    },
    markAsProcessed: (opts: MarkAsProcessedOptions): ResultAsync<Capture, MarkAsProcessedError> => {
      if (options.shouldFailOnSave) {
        return errAsync(storageError('Mark as processed failed'));
      }
      const index = captures.findIndex((c) => c.id === opts.id);
      if (index === -1) {
        return errAsync(storageError('Capture not found'));
      }
      
      // Check required status if provided (for atomic verification)
      if (opts.requiredStatus && captures[index].status !== opts.requiredStatus) {
        return errAsync(captureNotInInboxError(opts.id));
      }
      
      const updated: Capture = {
        ...captures[index],
        status: 'processed',
        processedAt: opts.processedAt,
        processedToType: opts.processedToType,
        processedToId: opts.processedToId,
      };
      captures[index] = updated;
      return okAsync(updated);
    },
  };
};
