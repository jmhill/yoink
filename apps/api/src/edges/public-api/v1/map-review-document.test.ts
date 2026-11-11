import type { ZodTypeAny } from 'zod';
import { describe, expect, it } from 'vitest';
import { publicApiV1Contract } from '@yoink/api-contracts/public-api/v1';
import type { RankedReviewProject, ReviewDonePage } from '../../../modules/review/index.js';
import { toContractDonePage, toContractReviewPage } from './map-review-document.js';

const outputSchema = (procedure: { '~orpc': { outputSchemas?: readonly unknown[] } }): ZodTypeAny => {
  const schema = procedure['~orpc'].outputSchemas?.[0];
  if (schema === undefined) {
    throw new Error('missing frozen output schema');
  }
  return schema as ZodTypeAny;
};

const organizationId = '550e8400-e29b-41d4-a716-446655440011';
const createdById = '550e8400-e29b-41d4-a716-446655440012';
const projectId = '550e8400-e29b-41d4-a716-446655440013';
const taskId = '550e8400-e29b-41d4-a716-446655440010';

const ranked: RankedReviewProject = {
  project: {
    id: projectId,
    organizationId,
    createdById,
    name: 'House storage',
    status: 'active',
    waitingOn: null,
    waitingSince: null,
    nextActionTaskId: null,
    notebookPages: [],
    createdAt: '2026-10-04T05:00:00.000Z',
    lastChangedAt: '2026-10-04T05:00:00.000Z',
    lastChangedBy: createdById,
    objective: 'Clear the attic',
  },
  reasons: ['noNextAction', 'quiet'],
  lastChangeAt: '2026-10-04T05:00:00.000Z',
  daysSinceChange: 8,
  daysWaiting: null,
  nextAction: null,
  sectionRank: '0',
  groupOldestSince: '0',
  groupName: '',
  rowWaitingSince: '0',
};

const done: ReviewDonePage = {
  timeZone: 'America/Chicago',
  week: { start: '2026-10-05', end: '2026-10-11' },
  previousWeek: '2026-09-28',
  nextWeek: null,
  groups: [
    {
      project: {
        id: projectId,
        organizationId,
        createdById,
        name: 'House storage',
        status: 'active',
        waitingOn: null,
        waitingSince: null,
        nextActionTaskId: taskId,
        notebookPages: [{ path: 'attic.md', url: 'https://notes.example/attic.md' }],
        createdAt: '2026-10-04T05:00:00.000Z',
        lastChangedAt: '2026-10-11T16:00:00.000Z',
        lastChangedBy: createdById,
      },
      nextAction: { id: taskId, title: 'Label the bins' },
      tasks: [
        {
          id: taskId,
          organizationId,
          createdById,
          title: 'Sort the boxes',
          createdAt: '2026-10-11T15:00:00.000Z',
          lastChangedAt: '2026-10-11T16:00:00.000Z',
          lastChangedBy: createdById,
          completedBy: createdById,
          completedAt: '2026-10-11T16:00:00.000Z',
          projectId,
          completedByName: 'Lane',
        },
      ],
    },
  ],
  otherTaskCount: 0,
  hasMore: false,
  nextCursor: null,
  total: 1,
};

describe('public API review mapping', () => {
  it('maps the review list query onto the frozen review page', () => {
    const body = toContractReviewPage({
      items: [ranked],
      hasMore: false,
      nextCursor: null,
      total: 1,
      today: '2026-10-12',
      counts: { noNextAction: 1, quiet: 1, waiting: 0 },
    });
    const schema = outputSchema(publicApiV1Contract.review.list);
    expect(body.projects[0]?.project.objective).toBe('Clear the attic');
    expect(body.projects[0]?.reasons).toEqual(['noNextAction', 'quiet']);
    expect(schema.parse(body)).toEqual(body);
  });

  it('maps the done-list query onto the frozen done page', () => {
    const body = toContractDonePage(done);
    const schema = outputSchema(publicApiV1Contract.review.done);
    expect(body.groups[0]?.tasks[0]?.completedByName).toBe('Lane');
    expect(body.groups[0]?.nextAction).toEqual({ id: taskId, title: 'Label the bins' });
    expect(schema.parse(body)).toEqual(body);
  });
});
