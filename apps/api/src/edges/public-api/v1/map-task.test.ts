import type { ZodTypeAny } from 'zod';
import { describe, expect, it } from 'vitest';
import { publicApiV1Contract } from '@yoink/api-contracts/public-api/v1';
import type { Task } from '../../../modules/task-management/index.js';
import { toContractTask, toContractTaskPage } from '../../_shared/map-task-document.js';
import { toTaskListBody } from '../../_shared/http-listed-page.js';

const outputSchema = (procedure: { '~orpc': { outputSchemas?: readonly unknown[] } }): ZodTypeAny => {
  const schema = procedure['~orpc'].outputSchemas?.[0];
  if (schema === undefined) {
    throw new Error('missing frozen output schema');
  }
  return schema as ZodTypeAny;
};

const minimal: Task = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  createdById: '550e8400-e29b-41d4-a716-446655440002',
  title: 'Buy milk',
  createdAt: '2025-01-15T10:00:00.000Z',
  lastChangedAt: null,
  lastChangedBy: null,
  completedBy: null,
};

const scheduled: Task = {
  ...minimal,
  captureId: '550e8400-e29b-41d4-a716-446655440003',
  dueDate: '2025-01-20',
  completedAt: '2025-01-21T10:00:00.000Z',
  pinnedAt: '2025-01-16T10:00:00.000Z',
  assigneeId: '550e8400-e29b-41d4-a716-446655440004',
  listId: '550e8400-e29b-41d4-a716-446655440005',
  projectId: '550e8400-e29b-41d4-a716-446655440006',
  openOrder: 2,
  completedBy: '550e8400-e29b-41d4-a716-446655440002',
  completedByName: 'Ada',
};

const scheduledJson =
  '{"id":"550e8400-e29b-41d4-a716-446655440000","organizationId":"550e8400-e29b-41d4-a716-446655440001","createdById":"550e8400-e29b-41d4-a716-446655440002","title":"Buy milk","createdAt":"2025-01-15T10:00:00.000Z","lastChangedAt":null,"lastChangedBy":null,"completedBy":"550e8400-e29b-41d4-a716-446655440002","captureId":"550e8400-e29b-41d4-a716-446655440003","dueDate":"2025-01-20","completedAt":"2025-01-21T10:00:00.000Z","pinnedAt":"2025-01-16T10:00:00.000Z","assigneeId":"550e8400-e29b-41d4-a716-446655440004","listId":"550e8400-e29b-41d4-a716-446655440005","projectId":"550e8400-e29b-41d4-a716-446655440006","openOrder":2,"completedByName":"Ada"}';

describe('public API task mapping', () => {
  it('maps a create command view onto the frozen task body', () => {
    const body = toContractTask(scheduled);
    const schema = outputSchema(publicApiV1Contract.tasks.create);
    expect(JSON.stringify(body)).toBe(scheduledJson);
    expect(schema.parse(body)).toEqual(body);
  });

  it('maps a list query page onto the frozen task list body', () => {
    const page = toContractTaskPage({
      items: [minimal],
      hasMore: false,
      nextCursor: null,
      total: 1,
    });
    const body = toTaskListBody({
      items: [minimal],
      hasMore: false,
      nextCursor: null,
      total: 1,
    });
    const schema = outputSchema(publicApiV1Contract.tasks.list);
    const json =
      '{"tasks":[{"id":"550e8400-e29b-41d4-a716-446655440000","organizationId":"550e8400-e29b-41d4-a716-446655440001","createdById":"550e8400-e29b-41d4-a716-446655440002","title":"Buy milk","createdAt":"2025-01-15T10:00:00.000Z","lastChangedAt":null,"lastChangedBy":null,"completedBy":null}],"hasMore":false,"nextCursor":null,"total":1}';
    expect(JSON.stringify(body)).toBe(json);
    expect(body.tasks).toEqual(page.items);
    expect(schema.parse(body)).toEqual(body);
  });
});
