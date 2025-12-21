import type { ResultAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type { StorageError } from './capture-errors.js';

export type FindByOrganizationOptions = {
  organizationId: string;
  status?: 'inbox' | 'archived';
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
};
