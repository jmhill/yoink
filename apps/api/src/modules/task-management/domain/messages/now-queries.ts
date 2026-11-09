import type { NowOwner } from '@yoink/api-contracts';

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
