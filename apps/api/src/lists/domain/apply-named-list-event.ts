import type { NamedList } from '@yoink/api-contracts';
import type { ListEvent, NamedListCreated, NamedListRenamed } from './events.js';

export const applyNamedListCreated = (event: NamedListCreated): NamedList => ({
  id: event.id,
  organizationId: event.organizationId,
  createdById: event.createdById,
  name: event.name,
  createdAt: event.createdAt,
});

export const applyNamedListRenamed = (
  current: NamedList,
  event: NamedListRenamed
): NamedList => ({
  ...current,
  name: event.name,
});

export const applyNamedListEvent = (
  _current: NamedList | null,
  event: ListEvent
): NamedList | null => {
  switch (event.type) {
    case 'OpenTasksReordered':
      return _current;
    case 'NamedListCreated':
      return applyNamedListCreated(event);
    case 'NamedListDeleted':
      return null;
    case 'NamedListRenamed':
      if (!_current) {
        return null;
      }
      return applyNamedListRenamed(_current, event);
  }
};
