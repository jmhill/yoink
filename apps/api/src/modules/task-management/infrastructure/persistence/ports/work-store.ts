import type { ResultAsync } from 'neverthrow';
import type { NowNextActionItem, Task } from '@yoink/api-contracts';
import type { KeysetRows } from '../../../../../kernel/listing/domain/listed-page.js';
import type { WorkListCursorRow } from '../../../../../kernel/listing/domain/list-keys.js';
import type { StorageError } from '../../../domain/messages/work-errors.js';
import type {
  PageNowDueOptions,
  PageNowNextActionsOptions,
  PageWorkListsOptions,
} from '../../../domain/messages/work-page.js';

export type { PageNowDueOptions, PageNowNextActionsOptions, PageWorkListsOptions };

export type WorkStore = {
  pageNextActions(
    options: PageNowNextActionsOptions
  ): ResultAsync<KeysetRows<NowNextActionItem>, StorageError>;
  pageDue(options: PageNowDueOptions): ResultAsync<KeysetRows<Task>, StorageError>;
  pageLists(
    options: PageWorkListsOptions
  ): ResultAsync<KeysetRows<WorkListCursorRow>, StorageError>;
  countUnlistedOpen(organizationId: string): ResultAsync<number, StorageError>;
};
