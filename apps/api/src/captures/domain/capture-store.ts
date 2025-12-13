import type { ResultAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type { StorageError } from './capture-errors.js';

export type FindByOrganizationOptions = {
  organizationId: string;
  status?: 'inbox' | 'archived';
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
