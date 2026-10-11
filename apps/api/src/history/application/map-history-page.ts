import { HISTORY_STARTS_AT, type HistoryPage, type TimelineEntry } from '@yoink/api-contracts';
import type { ListedPage } from '../../listing/domain/listed-page.js';
import {
  isUnparsedHistoryRow,
  type HistoryPageItem,
} from '../../shared/change-log/domain/history-page-item.js';
import {
  toTimelineEntry,
  unknownTimelineEntry,
  type TimelineLookups,
} from '../../shared/change-log/domain/to-timeline-entry.js';
import type { HistoryReadLogger } from './ports.js';

export const collectLookupIds = (items: readonly HistoryPageItem[]) => {
  const taskIds = new Set<string>();
  const userIds = new Set<string>();
  const projectIds = new Set<string>();

  for (const item of items) {
    const record = item.record;
    if (isUnparsedHistoryRow(record)) {
      if (record.subjectType === 'task') {
        taskIds.add(record.subjectId);
      }
      if (record.subjectType === 'project') {
        projectIds.add(record.subjectId);
      }
      if (record.actorUserId) {
        userIds.add(record.actorUserId);
      }
      continue;
    }
    if (record.subjectType === 'task') {
      taskIds.add(record.subjectId);
    }
    if (record.subjectType === 'project') {
      projectIds.add(record.subjectId);
    }
    if (record.actorUserId) {
      userIds.add(record.actorUserId);
    }
    if (record.kind === 'ProjectNextActionSet') {
      taskIds.add(record.payload.taskId);
      if (record.payload.previousTaskId) {
        taskIds.add(record.payload.previousTaskId);
      }
    }
    if (record.kind === 'ProjectNextActionCleared') {
      taskIds.add(record.payload.taskId);
    }
  }

  return {
    taskIds: [...taskIds],
    userIds: [...userIds],
    projectIds: [...projectIds],
  };
};

export const entriesFromHistoryPage = (
  page: ListedPage<HistoryPageItem>,
  lookups: TimelineLookups,
  logger: HistoryReadLogger
): HistoryPage => {
  const entries: TimelineEntry[] = [];
  for (const item of page.items) {
    const record = item.record;
    if (isUnparsedHistoryRow(record)) {
      if (record.subjectType === 'list') {
        logger.warn({
          recordId: record.id,
          kind: record.kind,
          reason: 'List subject is not a timeline subject',
        });
        continue;
      }
      if (record.subjectType !== 'task' && record.subjectType !== 'project') {
        logger.warn({
          recordId: record.id,
          kind: record.kind,
          reason: `Unrecognised change-log subject type: ${record.subjectType}`,
        });
        continue;
      }
      logger.warn({
        recordId: record.id,
        kind: record.kind,
        reason: 'Change log record did not match schema',
      });
      entries.push(
        unknownTimelineEntry({
          id: record.id,
          occurredAt: record.occurredAt,
          actorUserId: record.actorUserId,
          actorKind: record.actorKind,
          subjectType: record.subjectType,
          subjectId: record.subjectId,
          lookups,
        })
      );
      continue;
    }
    const mapped = toTimelineEntry(record, lookups);
    if (mapped) {
      entries.push(mapped);
    }
  }

  return {
    entries,
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
    total: page.total,
    historyStartsAt: HISTORY_STARTS_AT,
  };
};
