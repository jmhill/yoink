import type { ResultAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type { CaptureEvent } from '../domain/events.js';
import type { StorageError } from '../domain/capture-errors.js';
import type { FindByOrganizationOptions } from '../domain/capture-store.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';

export type PersistOutcome = {
  deletedCount?: number;
};

export type PersistCaptureEvent = (input: {
  event: CaptureEvent;
  current: Capture | null;
}) => ResultAsync<PersistOutcome, StorageError>;

export type LoadCapture = (
  id: string
) => ResultAsync<Capture | null, StorageError>;

export type ListCaptures = (
  options: FindByOrganizationOptions
) => ResultAsync<KeysetRows<Capture>, StorageError>;
