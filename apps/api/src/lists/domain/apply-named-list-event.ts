import type { NamedList } from '@yoink/api-contracts';
import type { ListEvent } from './events.js';

export const applyNamedListEvent = (
  _current: NamedList | null,
  event: ListEvent
): NamedList | null => {
  switch (event.type) {
    case 'OpenTasksReordered':
      return _current;
    case 'NamedListCreated':
      return {
        id: event.id,
        organizationId: event.organizationId,
        createdById: event.createdById,
        name: event.name,
        createdAt: event.createdAt,
      };
    case 'NamedListDeleted':
      return null;
    case 'NamedListRenamed':
      if (!_current) {
        return null;
      }
      return {
        ..._current,
        name: event.name,
      };
  }
};
