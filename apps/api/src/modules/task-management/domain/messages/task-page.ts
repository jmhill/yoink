import type { TaskFilter } from '@yoink/api-contracts';
import type { KeysetCursor } from '../../../../kernel/listing/domain/keyset-cursor.js';

/** Persistence page for tasks in one organization. The list query maps onto this. */
export type FindByOrganizationOptions = {
  organizationId: string;
  filter?: TaskFilter; // 'today' | 'upcoming' | 'all' | 'completed' | 'mine'
  today: string;
  /** Caller principal id; used when filter is 'mine' */
  assigneeId?: string;
  fetchLimit: number;
  seek?: KeysetCursor;
};
