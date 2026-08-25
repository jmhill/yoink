import type { Capture } from '@yoink/api-contracts';
import type { CaptureEvent } from './events.js';

export const applyCaptureEvent = (
  current: Capture | null,
  event: CaptureEvent
): Capture => {
  if (event.type === 'CaptureCreated') {
    return {
      id: event.id,
      organizationId: event.organizationId,
      createdById: event.createdById,
      content: event.content,
      title: event.title,
      sourceUrl: event.sourceUrl,
      sourceApp: event.sourceApp,
      status: 'inbox',
      capturedAt: event.capturedAt,
    };
  }

  if (!current) {
    throw new Error(`Cannot apply ${event.type} without current state`);
  }

  switch (event.type) {
    case 'CaptureTrashed':
      return {
        ...current,
        status: 'trashed',
        trashedAt: event.trashedAt,
        snoozedUntil: undefined,
      };
    case 'CaptureRestored':
      return {
        ...current,
        status: 'inbox',
        trashedAt: undefined,
      };
    case 'CaptureContentUpdated':
      return {
        ...current,
        title: event.title ?? current.title,
        content: event.content ?? current.content,
      };
    case 'CaptureSnoozed':
      return {
        ...current,
        snoozedUntil: event.until,
      };
    case 'CaptureUnsnoozed':
      return {
        ...current,
        snoozedUntil: undefined,
      };
    case 'CaptureDeleted':
    case 'CaptureTrashEmptied':
      throw new Error(`Cannot project a capture view from ${event.type}`);
  }
};
