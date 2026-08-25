import type { ResultAsync } from 'neverthrow';
import type { EmptyTrashCommand } from '../domain/capture-commands.js';
import type { EmptyTrashError } from '../domain/capture-errors.js';
import type { CaptureTrashEmptied } from '../domain/events.js';
import { decideEmptyTrash } from '../domain/decide-empty-trash.js';
import type { PersistCaptureEvent } from './ports.js';

export type HandleEmptyTrashDeps = {
  persist: PersistCaptureEvent;
};

export type EmptyTrashResult = {
  event: CaptureTrashEmptied;
  deletedCount: number;
};

export const handleEmptyTrash = (
  command: EmptyTrashCommand,
  deps: HandleEmptyTrashDeps
): ResultAsync<EmptyTrashResult, EmptyTrashError> => {
  const event = decideEmptyTrash({ command });
  return deps.persist({ event, current: null }).map((outcome) => ({
    event,
    deletedCount: outcome.deletedCount ?? 0,
  }));
};
