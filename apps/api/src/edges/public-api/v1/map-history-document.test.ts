import type { ZodTypeAny } from 'zod';
import { describe, expect, it } from 'vitest';
import { publicApiV1Contract } from '@yoink/api-contracts/public-api/v1';
import type { HistoryPage, ListedTask, TimelineEntry } from '../../../modules/history/index.js';
import { HISTORY_STARTS_AT } from '../../../modules/history/index.js';
import { toContractHistoryPage, toHistoryTaskListBody } from './map-history-document.js';

const outputSchema = (procedure: { '~orpc': { outputSchemas?: readonly unknown[] } }): ZodTypeAny => {
  const schema = procedure['~orpc'].outputSchemas?.[0];
  if (schema === undefined) {
    throw new Error('missing frozen output schema');
  }
  return schema as ZodTypeAny;
};

const taskId = '550e8400-e29b-41d4-a716-446655440010';
const organizationId = '550e8400-e29b-41d4-a716-446655440011';
const createdById = '550e8400-e29b-41d4-a716-446655440012';
const projectId = '550e8400-e29b-41d4-a716-446655440013';

const created: TimelineEntry = {
  id: 'log-1',
  kind: 'TaskCreated',
  occurredAt: '2026-10-11T15:04:00.000Z',
  actor: { userId: createdById, kind: 'user', name: 'Lane' },
  subject: { type: 'task', id: taskId, title: 'Call Trident', deleted: false },
  details: { kind: 'TaskCreated', via: 'import', projectName: 'Kitchen' },
};

const page: HistoryPage = {
  entries: [created],
  hasMore: false,
  nextCursor: null,
  total: 1,
  historyStartsAt: HISTORY_STARTS_AT,
};

const finished: ListedTask = {
  id: taskId,
  organizationId,
  createdById,
  title: 'Paint samples',
  createdAt: '2026-10-11T15:00:00.000Z',
  lastChangedAt: '2026-10-11T16:00:00.000Z',
  lastChangedBy: createdById,
  completedBy: createdById,
  completedAt: '2026-10-11T16:00:00.000Z',
  projectId,
  completedByName: 'Lane',
};

describe('public API history mapping', () => {
  it('maps a project history query onto the frozen history page', () => {
    const body = toContractHistoryPage(page);
    const schema = outputSchema(publicApiV1Contract.projects.listHistory);
    expect(body.historyStartsAt).toBe(HISTORY_STARTS_AT);
    expect(body.entries).toEqual([created]);
    expect(schema.parse(body)).toEqual(body);
  });

  it('maps a finished-task query onto the frozen task list', () => {
    const body = toHistoryTaskListBody({
      items: [finished],
      hasMore: false,
      nextCursor: null,
      total: 1,
    });
    const schema = outputSchema(publicApiV1Contract.projects.listOpenTasks);
    expect(schema.parse(body)).toEqual(body);
    expect(body.tasks[0]?.completedByName).toBe('Lane');
  });
});
