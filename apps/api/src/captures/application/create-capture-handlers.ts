import { handleCreateCapture } from './handle-create-capture.js';
import { handleFindCapture } from './handle-find-capture.js';
import { handleListCaptures } from './handle-list-captures.js';
import { handleUpdateCapture } from './handle-update-capture.js';
import { handleTrashCapture } from './handle-trash-capture.js';
import { handleRestoreCapture } from './handle-restore-capture.js';
import { handleSnoozeCapture } from './handle-snooze-capture.js';
import { handleUnsnoozeCapture } from './handle-unsnooze-capture.js';
import { handleDeleteCapture } from './handle-delete-capture.js';
import { handleEmptyTrash } from './handle-empty-trash.js';
import type { ListCaptures, LoadCapture, PersistCaptureEvent } from './ports.js';

export type CaptureHandlerDeps = {
  persist: PersistCaptureEvent;
  load: LoadCapture;
  list: ListCaptures;
  nextId: () => string;
  now: () => string;
};

export const createCaptureHandlers = (deps: CaptureHandlerDeps) => ({
  create: (command: Parameters<typeof handleCreateCapture>[0]) =>
    handleCreateCapture(command, deps),
  find: (query: Parameters<typeof handleFindCapture>[0]) =>
    handleFindCapture(query, deps),
  list: (query: Parameters<typeof handleListCaptures>[0]) =>
    handleListCaptures(query, deps),
  update: (command: Parameters<typeof handleUpdateCapture>[0]) =>
    handleUpdateCapture(command, deps),
  trash: (command: Parameters<typeof handleTrashCapture>[0]) =>
    handleTrashCapture(command, deps),
  restore: (command: Parameters<typeof handleRestoreCapture>[0]) =>
    handleRestoreCapture(command, deps),
  snooze: (command: Parameters<typeof handleSnoozeCapture>[0]) =>
    handleSnoozeCapture(command, deps),
  unsnooze: (command: Parameters<typeof handleUnsnoozeCapture>[0]) =>
    handleUnsnoozeCapture(command, deps),
  delete: (command: Parameters<typeof handleDeleteCapture>[0]) =>
    handleDeleteCapture(command, deps),
  emptyTrash: (command: Parameters<typeof handleEmptyTrash>[0]) =>
    handleEmptyTrash(command, deps),
});

export type CaptureHandlers = ReturnType<typeof createCaptureHandlers>;
