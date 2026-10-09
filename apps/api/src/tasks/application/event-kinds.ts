import type { ChangeLogKind } from '../../shared/change-log/domain/kinds.js';
import type { WriteResult } from './write-result.js';
import type { DeleteTaskResult } from './handle-delete-task.js';

export const eventKindsFromWrite = (result: WriteResult): ChangeLogKind[] => {
  if (!result.event) {
    return [];
  }
  if (result.event.type === 'TaskUncompleted' && result.event.siblingOrders.length > 0) {
    return ['TaskUncompleted', 'OpenTasksRenumbered'];
  }
  return [result.event.type];
};

export const eventKindsFromDelete = (result: DeleteTaskResult): ChangeLogKind[] => [
  result.event.type,
];
