import type { ZodTypeAny } from 'zod';
import { describe, expect, it } from 'vitest';
import { publicApiV1Contract } from '@yoink/api-contracts/public-api/v1';
import type { Capture } from '../../../modules/captures/index.js';
import { toContractCapture, toContractCaptureList } from './map-capture.js';

const outputSchema = (procedure: { '~orpc': { outputSchemas?: readonly unknown[] } }): ZodTypeAny => {
  const schema = procedure['~orpc'].outputSchemas?.[0];
  if (schema === undefined) {
    throw new Error('missing frozen output schema');
  }
  return schema as ZodTypeAny;
};

const minimal: Capture = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  createdById: '550e8400-e29b-41d4-a716-446655440002',
  content: 'From bearer',
  status: 'inbox',
  capturedAt: '2025-01-15T10:00:00.000Z',
};

const processed: Capture = {
  ...minimal,
  title: 'A title',
  sourceUrl: 'https://example.com/article',
  sourceApp: 'android-share',
  status: 'processed',
  trashedAt: '2025-01-16T10:00:00.000Z',
  snoozedUntil: '2025-01-17T10:00:00.000Z',
  processedAt: '2025-01-18T10:00:00.000Z',
  processedToType: 'task',
  processedToId: '550e8400-e29b-41d4-a716-446655440003',
};

const processedJson =
  '{"id":"550e8400-e29b-41d4-a716-446655440000","organizationId":"550e8400-e29b-41d4-a716-446655440001","createdById":"550e8400-e29b-41d4-a716-446655440002","content":"From bearer","title":"A title","sourceUrl":"https://example.com/article","sourceApp":"android-share","status":"processed","capturedAt":"2025-01-15T10:00:00.000Z","trashedAt":"2025-01-16T10:00:00.000Z","snoozedUntil":"2025-01-17T10:00:00.000Z","processedAt":"2025-01-18T10:00:00.000Z","processedToType":"task","processedToId":"550e8400-e29b-41d4-a716-446655440003"}';

describe('public API capture mapping', () => {
  it('maps a create command view onto the frozen capture body', () => {
    const body = toContractCapture(processed);
    const schema = outputSchema(publicApiV1Contract.captures.create);
    expect(JSON.stringify(body)).toBe(processedJson);
    expect(JSON.stringify(schema.parse(body))).toBe(processedJson);
  });

  it('maps a list query page onto the frozen capture list body', () => {
    const body = toContractCaptureList({
      items: [minimal],
      hasMore: false,
      nextCursor: null,
      total: 1,
    });
    const schema = outputSchema(publicApiV1Contract.captures.list);
    const json =
      '{"captures":[{"id":"550e8400-e29b-41d4-a716-446655440000","organizationId":"550e8400-e29b-41d4-a716-446655440001","createdById":"550e8400-e29b-41d4-a716-446655440002","content":"From bearer","status":"inbox","capturedAt":"2025-01-15T10:00:00.000Z"}],"hasMore":false,"nextCursor":null,"total":1}';
    expect(JSON.stringify(body)).toBe(json);
    expect(schema.parse(body)).toEqual(body);
  });
});
