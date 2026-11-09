import type { InvalidCursorError } from '../../../../kernel/listing/domain/invalid-cursor.js';
import { storageError, type StorageError } from './storage-error.js';

export { storageError, type StorageError };

export type ListNowError = StorageError | InvalidCursorError;
export type ListWorkListsError = StorageError | InvalidCursorError;
