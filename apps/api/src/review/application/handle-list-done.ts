import { errAsync, ok, type ResultAsync } from 'neverthrow';
import type { DoneListGroup, DoneListPage } from '@yoink/api-contracts';
import { TimeZoneSchema } from '@yoink/api-contracts';
import { resolveListLimit } from '../../listing/domain/list-kind.js';
import { doneListCursor } from '../../listing/domain/list-keys.js';
import { assembleListedPage } from '../../listing/domain/listed-page.js';
import { decodeKeysetCursor, encodeKeysetCursor } from '../../listing/application/keyset-codec.js';
import {
  DEFAULT_VIEWER_TIME_ZONE,
  viewerToday,
} from '../../shared/domain/viewer-today.js';
import { groupDoneRows, type DoneListGroup as GroupedDoneList } from '../domain/group-done.js';
import { invalidWeekError, type ListDoneError } from '../domain/review-errors.js';
import type { ListDoneQuery } from '../domain/review-queries.js';
import {
  compareCalendarDates,
  isCalendarMonday,
  mondayOnOrBefore,
  nextMonday,
  previousMonday,
  weekDates,
  weekUtcBounds,
} from '../domain/week-bounds.js';
import type { LoadCompletedByNames, LoadOrganizationTimeZone, PageDoneList } from './ports.js';

export type HandleListDoneDeps = {
  loadTimeZone: LoadOrganizationTimeZone;
  pageDoneList: PageDoneList;
  loadCompletedByNames: LoadCompletedByNames;
  now: () => Date;
};

const resolveStoredTimeZone = (raw: string): string => {
  const parsed = TimeZoneSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_VIEWER_TIME_ZONE;
};

const withCompletedByNames = (
  groups: readonly GroupedDoneList[],
  nameOf: (userId: string) => string
): DoneListGroup[] =>
  groups.map((group) => ({
    project: group.project,
    nextAction: group.nextAction,
    tasks: group.tasks.map((task) =>
      task.completedBy === null
        ? { ...task }
        : { ...task, completedByName: nameOf(task.completedBy) }
    ),
  }));

export const handleListDone = (
  query: ListDoneQuery,
  deps: HandleListDoneDeps
): ResultAsync<DoneListPage, ListDoneError> => {
  return deps.loadTimeZone(query.organizationId).andThen((rawZone) => {
    const timeZone = resolveStoredTimeZone(rawZone);
    const today = viewerToday({ now: deps.now(), timeZone });
    const currentMonday = mondayOnOrBefore(today);

    if (query.week !== undefined && !isCalendarMonday(query.week)) {
      return errAsync(invalidWeekError('week must be a Monday'));
    }
    if (
      query.week !== undefined &&
      compareCalendarDates(query.week, currentMonday) > 0
    ) {
      return errAsync(invalidWeekError('week cannot be in the future'));
    }

    const monday = query.week ?? currentMonday;
    const week = weekDates(monday);
    const bounds = weekUtcBounds(monday, timeZone);
    const limit = resolveListLimit(query.limit, 'pile');
    const seekResult =
      query.cursor === undefined
        ? ok(undefined)
        : decodeKeysetCursor(query.cursor, doneListCursor.view);

    return seekResult.match(
      (seek) =>
        deps
          .pageDoneList({
            organizationId: query.organizationId,
            completedAfter: bounds.start,
            completedBefore: bounds.end,
            fetchLimit: limit + 1,
            seek,
          })
          .andThen((loaded) => {
            const assembled = assembleListedPage({
              rows: loaded.rows,
              total: loaded.total,
              limit,
              cursorOf: (row) => doneListCursor.of(row.task),
            });
            const userIds = [
              ...new Set(
                assembled.items.flatMap((row) =>
                  row.task.completedBy ? [row.task.completedBy] : []
                )
              ),
            ];
            return deps.loadCompletedByNames(userIds).map((nameOf) => ({
              timeZone,
              week,
              previousWeek: previousMonday(monday),
              nextWeek:
                compareCalendarDates(nextMonday(monday), currentMonday) > 0
                  ? null
                  : nextMonday(monday),
              groups: withCompletedByNames(groupDoneRows(assembled.items), nameOf),
              otherTaskCount: loaded.otherTaskCount,
              hasMore: assembled.hasMore,
              nextCursor: assembled.next === null ? null : encodeKeysetCursor(assembled.next),
              total: assembled.total,
            }));
          }),
      (error) => errAsync(error)
    );
  });
};
