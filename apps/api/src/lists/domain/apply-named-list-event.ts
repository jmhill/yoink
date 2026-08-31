import type { NamedList } from '@yoink/api-contracts';
import type { NamedListEvent } from './events.js';

export const applyNamedListEvent = (
  _current: NamedList | null,
  event: NamedListEvent
): NamedList => {
  switch (event.type) {
    case 'NamedListCreated':
      return {
        id: event.id,
        organizationId: event.organizationId,
        createdById: event.createdById,
        name: event.name,
        createdAt: event.createdAt,
      };
  }
};
