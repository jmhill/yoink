import type { ResultAsync } from 'neverthrow';
import type { Capture, CaptureStatus, ProcessedToType } from '@yoink/api-contracts';
import type { CaptureNotInInboxError, StorageError } from './capture-errors.js';

export type MarkAsProcessedOptions = {
  id: string;
  processedAt: string;
  processedToType: ProcessedToType;
  processedToId: string;
  /** If provided, the operation will fail if the capture is not in this status */
  requiredStatus?: CaptureStatus;
};

export type MarkAsProcessedError = StorageError | CaptureNotInInboxError;

export type FindByOrganizationOptions = {
  organizationId: string;
  status?: CaptureStatus;
  snoozed?: boolean; // true = only snoozed, false = exclude snoozed, undefined = no filtering
  now?: string; // Current time for snooze comparison (ISO datetime)
  limit?: number;
  cursor?: string;
};

export type FindByOrganizationResult = {
  captures: Capture[];
  nextCursor?: string;
};

export type CaptureStore = {
  save(capture: Capture): ResultAsync<void, StorageError>;
  findById(id: string): ResultAsync<Capture | null, StorageError>;
  update(capture: Capture): ResultAsync<void, StorageError>;
  findByOrganization(
    options: FindByOrganizationOptions
  ): ResultAsync<FindByOrganizationResult, StorageError>;
  // Soft delete - sets deletedAt timestamp
  softDelete(id: string): ResultAsync<void, StorageError>;
  // Soft delete all trashed captures for an organization
  softDeleteTrashed(organizationId: string): ResultAsync<number, StorageError>;
  // Mark capture as processed (converted to task/note)
  // If requiredStatus is provided and the capture is not in that status,
  // returns CaptureNotInInboxError (for atomic status verification within transactions)
  markAsProcessed(options: MarkAsProcessedOptions): ResultAsync<Capture, MarkAsProcessedError>;
};
