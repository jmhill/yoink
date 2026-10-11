import type { ResultAsync } from 'neverthrow';
import type { NowNextActionItem, Task } from '@yoink/api-contracts';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import type {
  PageNowDueOptions,
  PageNowNextActionsOptions,
  PageWorkListsOptions,
  WorkListsPageRows,
} from '../domain/work-store.js';
import type { StorageError } from '../domain/work-errors.js';

export type PageNowNextActions = (
  options: PageNowNextActionsOptions
) => ResultAsync<KeysetRows<NowNextActionItem>, StorageError>;

export type PageNowDue = (
  options: PageNowDueOptions
) => ResultAsync<KeysetRows<Task>, StorageError>;

export type PageWorkLists = (
  options: PageWorkListsOptions
) => ResultAsync<WorkListsPageRows, StorageError>;
