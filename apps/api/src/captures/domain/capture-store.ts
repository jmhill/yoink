import type { ResultAsync } from 'neverthrow';
import type { Capture, CaptureStatus, ProcessedToType } from '@yoink/api-contracts';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import type { CaptureNotInInboxError, StorageError } from './capture-errors.js';

export type MarkAsProcessedOptions = {
  id: string;
  processedAt: string;
  processedToType: ProcessedToType;
  processedToId: string;
  requiredStatus?: CaptureStatus;
};

export type MarkAsProcessedError = StorageError | CaptureNotInInboxError;

export type FindByOrganizationOptions = {
  organizationId: string;
  status?: CaptureStatus;
  snoozed?: boolean;
  now?: string;
  fetchLimit: number;
  seek?: KeysetCursor;
};

export type CaptureStore = {
  save(capture: Capture): ResultAsync<void, StorageError>;
  findById(id: string): ResultAsync<Capture | null, StorageError>;
  update(capture: Capture): ResultAsync<void, StorageError>;
  findByOrganization(
    options: FindByOrganizationOptions
  ): ResultAsync<KeysetRows<Capture>, StorageError>;
  softDelete(id: string): ResultAsync<void, StorageError>;
  softDeleteTrashed(organizationId: string): ResultAsync<number, StorageError>;
  markAsProcessed(options: MarkAsProcessedOptions): ResultAsync<Capture, MarkAsProcessedError>;
};
