import type { Capture } from '@yoink/api-contracts';
import type { CaptureEvent } from '../messages/events.js';

export type CaptureInsert = {
  readonly op: 'insert';
  readonly capture: Capture;
};

export type CaptureReplace = {
  readonly op: 'update';
  readonly capture: Capture;
};

export type CaptureSoftDelete = {
  readonly op: 'soft-delete';
  readonly id: string;
  readonly organizationId: string;
  readonly deletedAt: string;
};

export type CaptureEmptyTrash = {
  readonly op: 'empty-trash';
  readonly organizationId: string;
  readonly deletedAt: string;
};

export type CaptureMarkProcessed = {
  readonly op: 'mark-processed';
  readonly id: string;
  readonly organizationId: string;
  readonly processedAt: string;
  readonly processedToType: string;
  readonly processedToId: string;
};

export type CaptureWrite =
  | CaptureInsert
  | CaptureReplace
  | CaptureSoftDelete
  | CaptureEmptyTrash
  | CaptureMarkProcessed;

/** Opaque to the unit of work. Only the captures participant reads it. */
export type CapturePlan = {
  readonly writes: readonly CaptureWrite[];
};

export const emptyCapturePlan = (): CapturePlan => ({ writes: [] });

export const planCaptureInsert = (capture: Capture): CapturePlan => ({
  writes: [{ op: 'insert', capture }],
});

export const planCaptureUpdate = (capture: Capture): CapturePlan => ({
  writes: [{ op: 'update', capture }],
});

export const planCaptureSoftDelete = (input: {
  id: string;
  organizationId: string;
  deletedAt: string;
}): CapturePlan => ({
  writes: [{ op: 'soft-delete', ...input }],
});

export const planEmptyTrash = (input: {
  organizationId: string;
  deletedAt: string;
}): CapturePlan => ({
  writes: [{ op: 'empty-trash', ...input }],
});

export const planMarkProcessed = (input: {
  id: string;
  organizationId: string;
  processedAt: string;
  processedToType: string;
  processedToId: string;
}): CapturePlan => ({
  writes: [{ op: 'mark-processed', ...input }],
});

/** The projected view is the row the update writes. Delete plans do not need one. */
export const planFromCaptureEvent = (input: {
  event: Exclude<CaptureEvent, { type: 'Noop' }>;
  view: Capture | null;
  deletedAt: string;
}): CapturePlan => {
  switch (input.event.type) {
    case 'CaptureCreated':
      if (input.view === null) {
        return emptyCapturePlan();
      }
      return planCaptureInsert(input.view);
    case 'CaptureDeleted':
      return planCaptureSoftDelete({
        id: input.event.id,
        organizationId: input.event.organizationId,
        deletedAt: input.deletedAt,
      });
    case 'CaptureTrashEmptied':
      return planEmptyTrash({
        organizationId: input.event.organizationId,
        deletedAt: input.deletedAt,
      });
    default:
      if (input.view === null) {
        return emptyCapturePlan();
      }
      return planCaptureUpdate(input.view);
  }
};
