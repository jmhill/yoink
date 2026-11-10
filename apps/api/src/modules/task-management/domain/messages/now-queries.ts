import type { NowOwner } from '../model/work-item.js';
export type ListNowNextActionsQuery = {
  organizationId: string;
  callerId: string;
  owner: NowOwner;
  limit?: number;
  cursor?: string;
};

export type ListNowDueQuery = {
  organizationId: string;
  callerId: string;
  owner: NowOwner;
  limit?: number;
  cursor?: string;
  timeZone?: string;
};

export type ListWorkListsQuery = {
  organizationId: string;
  limit?: number;
  cursor?: string;
};
