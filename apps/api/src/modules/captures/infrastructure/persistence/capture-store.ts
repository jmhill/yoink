import type { ResultAsync } from 'neverthrow';
import type { Capture, CaptureStatus, ProcessedToType } from '@yoink/api-contracts';
import type { KeysetRows } from '../../../../kernel/listing/domain/listed-page.js';
import type { FindByOrganizationOptions } from '../../application/ports.js';
import type { CaptureNotInInboxError, StorageError } from '../../domain/messages/capture-errors.js';

export type { FindByOrganizationOptions };

export type MarkAsProcessedOptions = {
  id: string;
  processedAt: string;
  processedToType: ProcessedToType;
  processedToId: string;
  /** If provided, the operation will fail if the capture is not in this status */
  requiredStatus?: CaptureStatus;
};

export type MarkAsProcessedError = StorageError | CaptureNotInInboxError;

export type CaptureStore = {
  save(capture: Capture): ResultAsync<void, StorageError>;
  findById(id: string): ResultAsync<Capture | null, StorageError>;
  update(capture: Capture): ResultAsync<void, StorageError>;
  findByOrganization(
    options: FindByOrganizationOptions
  ): ResultAsync<KeysetRows<Capture>, StorageError>;
  // Soft delete - sets deletedAt timestamp
  softDelete(id: string): ResultAsync<void, StorageError>;
  // Soft delete all trashed captures for an organization
  softDeleteTrashed(organizationId: string): ResultAsync<number, StorageError>;
  // Mark capture as processed (converted to task/note)
  // If requiredStatus is provided and the capture is not in that status,
  // returns CaptureNotInInboxError (for atomic status verification within transactions)
  markAsProcessed(options: MarkAsProcessedOptions): ResultAsync<Capture, MarkAsProcessedError>;
};
