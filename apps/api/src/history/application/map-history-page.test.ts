import { describe, it, expect } from 'vitest';
import { HISTORY_STARTS_AT } from '@yoink/api-contracts';
import { UNKNOWN_ACTOR_NAME } from '../../shared/change-log/domain/to-timeline-entry.js';
import type { HistoryPageItem } from '../../shared/change-log/infrastructure/sqlite-change-log-store.js';
import { collectLookupIds, entriesFromHistoryPage } from './map-history-page.js';

const lookups = {
  subjectOf: () => ({ title: 'Old invoice', deleted: true }),
  taskTitleOf: () => 'Old invoice',
  actorNameOf: (userId: string | null) => (userId ? 'Lane' : UNKNOWN_ACTOR_NAME),
};

describe('entriesFromHistoryPage', () => {
  it('maps an unparsed row to Unknown and keeps paging totals', () => {
    const warnings: Array<{ recordId: string; kind: string; reason: string }> = [];
    const item: HistoryPageItem = {
      occurredAt: '2026-10-11T16:00:00.000Z',
      seq: 4,
      record: {
        type: 'UNPARSED',
        id: 'log-bad',
        kind: 'FutureKind',
        occurredAt: '2026-10-11T16:00:00.000Z',
        actorUserId: 'user-1',
        actorKind: 'user',
        subjectType: 'task',
        subjectId: 'task-1',
      },
    };

    expect(collectLookupIds([item])).toEqual({
      taskIds: ['task-1'],
      userIds: ['user-1'],
      projectIds: [],
    });

    const page = entriesFromHistoryPage(
      {
        items: [item],
        hasMore: false,
        nextCursor: null,
        total: 1,
      },
      lookups,
      { warn: (fields) => warnings.push(fields) }
    );

    expect(page.historyStartsAt).toBe(HISTORY_STARTS_AT);
    expect(page.total).toBe(1);
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]).toMatchObject({
      id: 'log-bad',
      kind: 'Unknown',
      actor: { name: 'Lane', kind: 'user' },
      subject: { type: 'task', id: 'task-1', title: 'Old invoice', deleted: true },
      details: { kind: 'Unknown' },
    });
    expect(warnings).toEqual([
      {
        recordId: 'log-bad',
        kind: 'FutureKind',
        reason: 'Change log record did not match schema',
      },
    ]);
  });
});
