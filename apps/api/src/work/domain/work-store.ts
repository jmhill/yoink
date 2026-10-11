import type { ResultAsync } from 'neverthrow';
import type { NowNextActionItem, NowOwner, Task } from '@yoink/api-contracts';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import type { WorkListCursorRow } from '../../listing/domain/list-keys.js';
import type { StorageError } from './work-errors.js';

export type PageNowNextActionsOptions = {
  organizationId: string;
  owner: NowOwner;
  callerId: string;
  fetchLimit: number;
  seek?: KeysetCursor;
};

export type PageNowDueOptions = {
  organizationId: string;
  owner: NowOwner;
  callerId: string;
  today: string;
  fetchLimit: number;
  seek?: KeysetCursor;
};

export type PageWorkListsOptions = {
  organizationId: string;
  fetchLimit: number;
  seek?: KeysetCursor;
};

export type WorkListsPageRows = {
  lists: KeysetRows<WorkListCursorRow>;
  unlistedOpenCount: number;
};

export type WorkStore = {
  pageNextActions(
    options: PageNowNextActionsOptions
  ): ResultAsync<KeysetRows<NowNextActionItem>, StorageError>;
  pageDue(options: PageNowDueOptions): ResultAsync<KeysetRows<Task>, StorageError>;
  pageLists(options: PageWorkListsOptions): ResultAsync<WorkListsPageRows, StorageError>;
};
