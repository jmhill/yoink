import type { ResultAsync } from 'neverthrow';
import type { Capture, CaptureStatus } from '../domain/model/capture.js';
import type { IdGenerator } from '../../../kernel/id-generator.js';
import type { KeysetCursor } from '../../../kernel/listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../../kernel/listing/domain/listed-page.js';
import type { UnitOfWork } from '../../../kernel/unit-of-work.js';
import type { StorageError } from '../domain/messages/capture-errors.js';

export type FindByOrganizationOptions = {
  organizationId: string;
  status?: CaptureStatus;
  snoozed?: boolean;
  now?: string;
  fetchLimit: number;
  seek?: KeysetCursor;
};

export type LoadCapture = (id: string) => ResultAsync<Capture | null, StorageError>;

export type ListCaptures = (
  options: FindByOrganizationOptions
) => ResultAsync<KeysetRows<Capture>, StorageError>;

export type CountTrashedCaptures = (
  organizationId: string
) => ResultAsync<number, StorageError>;

/** Reads stay outside the transaction. Writes go through the unit of work. */
export type CaptureRuntime = {
  load: LoadCapture;
  list: ListCaptures;
  countTrashed: CountTrashedCaptures;
  uow: UnitOfWork;
  ids: IdGenerator;
  now: () => string;
};
