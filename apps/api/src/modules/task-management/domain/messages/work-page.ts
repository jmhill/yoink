import type { NowOwner } from '../model/work-item.js';
import type { KeysetCursor } from '../../../../kernel/listing/domain/keyset-cursor.js';

/** Persistence page for the Now next-action keyset. */
export type PageNowNextActionsOptions = {
  organizationId: string;
  owner: NowOwner;
  callerId: string;
  fetchLimit: number;
  seek?: KeysetCursor;
};

/** Persistence page for the due keyset. `today` is the viewer's calendar date. */
export type PageNowDueOptions = {
  organizationId: string;
  owner: NowOwner;
  callerId: string;
  today: string;
  fetchLimit: number;
  seek?: KeysetCursor;
};

/** Persistence page for the work-list keyset. */
export type PageWorkListsOptions = {
  organizationId: string;
  fetchLimit: number;
  seek?: KeysetCursor;
};
