import { describe, expect, it } from 'vitest';
import type { Project, ReviewProject } from '@yoink/api-contracts';
import {
  groupWaitingProjects,
  partitionReviewSections,
  reviewAttentionCount,
  reviewAttentionTotal,
  reviewSectionOf,
  reviewVersionOf,
  waitingGroupKey,
} from './review-sections';

const project = (overrides: Partial<Project> = {}): Project => ({
  id: '550e8400-e29b-41d4-a716-446655440010',
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  name: 'House storage',
  status: 'active',
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: null,
  notebookPages: [],
  createdById: '550e8400-e29b-41d4-a716-446655440002',
  createdAt: '2026-10-01T10:00:00.000Z',
  lastChangedAt: '2026-10-03T17:00:00.000Z',
  lastChangedBy: null,
  ...overrides,
});

const item = (overrides: Partial<ReviewProject> = {}): ReviewProject => ({
  project: project(),
  reasons: ['noNextAction'],
  lastChangeAt: '2026-10-03T17:00:00.000Z',
  daysSinceChange: 9,
  daysWaiting: null,
  nextAction: null,
  ...overrides,
});

describe('review sections', () => {
  it('puts active no-next-action in Needs, even when also quiet', () => {
    const both = item({
      reasons: ['noNextAction', 'quiet'],
    });
    expect(reviewSectionOf(both)).toBe('noNextAction');
  });

  it('keeps waiting with no next action in Waiting', () => {
    const waitingNoNext = item({
      project: project({
        id: '550e8400-e29b-41d4-a716-446655440011',
        name: 'Trusts',
        status: 'waiting',
        waitingOn: 'Mike',
      }),
      reasons: ['noNextAction', 'waiting'],
    });
    expect(reviewSectionOf(waitingNoNext)).toBe('waiting');
  });

  it('partitions first matching section and groups waiting rows', () => {
    const needs = item();
    const quiet = item({
      project: project({
        id: '550e8400-e29b-41d4-a716-446655440012',
        name: 'Quiet garden',
        nextActionTaskId: '550e8400-e29b-41d4-a716-446655440020',
      }),
      reasons: ['quiet'],
    });
    const trusts = item({
      project: project({
        id: '550e8400-e29b-41d4-a716-446655440013',
        name: 'Trusts',
        status: 'waiting',
        waitingOn: 'Mike',
      }),
      reasons: ['waiting'],
    });
    const otherMike = item({
      project: project({
        id: '550e8400-e29b-41d4-a716-446655440014',
        name: 'Other Mike',
        status: 'waiting',
        waitingOn: ' mike ',
      }),
      reasons: ['waiting'],
    });
    const unknown = item({
      project: project({
        id: '550e8400-e29b-41d4-a716-446655440015',
        name: 'Unknown',
        status: 'waiting',
        waitingOn: null,
      }),
      reasons: ['waiting'],
    });
    const sections = partitionReviewSections([needs, quiet, trusts, otherMike, unknown]);
    expect(sections.noNextAction.map((row) => row.project.name)).toEqual(['House storage']);
    expect(sections.quiet.map((row) => row.project.name)).toEqual(['Quiet garden']);
    expect(sections.waiting.map((row) => row.project.name)).toEqual([
      'Trusts',
      'Other Mike',
      'Unknown',
    ]);
    expect(waitingGroupKey(' Mike ')).toBe('mike');
    expect(groupWaitingProjects(sections.waiting).map((group) => group.label)).toEqual([
      'Mike',
      'Waiting',
    ]);
    expect(groupWaitingProjects(sections.waiting)[0]?.items.map((row) => row.project.name)).toEqual([
      'Trusts',
      'Other Mike',
    ]);
  });

  it('counts unique attention items and versions the page', () => {
    const needs = item();
    const both = item({
      project: project({
        id: '550e8400-e29b-41d4-a716-446655440016',
        name: 'Stale empty',
      }),
      reasons: ['noNextAction', 'quiet'],
    });
    const quiet = item({
      project: project({
        id: '550e8400-e29b-41d4-a716-446655440017',
        name: 'Quiet garden',
      }),
      reasons: ['quiet'],
    });
    const waiting = item({
      project: project({
        id: '550e8400-e29b-41d4-a716-446655440018',
        name: 'Trusts',
        status: 'waiting',
      }),
      reasons: ['waiting'],
    });
    expect(reviewAttentionCount([needs, both, quiet, waiting])).toBe(3);
    expect(reviewAttentionTotal([], 4)).toBe(4);
    expect(reviewAttentionTotal([needs], 4)).toBe(5);
    expect(reviewAttentionTotal([needs], 0)).toBe(1);
    expect(reviewAttentionTotal([waiting], 4)).toBe(4);
    expect(reviewVersionOf([needs, quiet])).toBe(
      `${needs.project.id}:noNextAction:${needs.lastChangeAt}|${quiet.project.id}:quiet:${quiet.lastChangeAt}`
    );
  });
});
