import { describe, expect, it } from 'vitest';
import type { Capture } from '../model/capture.js';
import { planFromCaptureEvent, planMarkProcessed } from './plan-capture.js';

const view: Capture = {
  id: 'cap-1',
  organizationId: 'org-1',
  createdById: 'user-1',
  content: 'Hello',
  status: 'inbox',
  capturedAt: '2026-11-07T00:00:00.000Z',
};

describe('planFromCaptureEvent', () => {
  it('plans an insert from the created view', () => {
    const plan = planFromCaptureEvent({
      event: {
        type: 'CaptureCreated',
        id: view.id,
        organizationId: view.organizationId,
        createdById: view.createdById,
        content: view.content,
        capturedAt: view.capturedAt,
      },
      view,
      deletedAt: '2026-11-07T01:00:00.000Z',
    });
    expect(plan.writes).toEqual([{ op: 'insert', capture: view }]);
  });

  it('plans a guarded claim separately from a content update', () => {
    const claim = planMarkProcessed({
      id: 'cap-1',
      organizationId: 'org-1',
      processedAt: '2026-11-07T01:00:00.000Z',
      processedToType: 'task',
      processedToId: 'task-1',
    });
    expect(claim.writes[0]).toMatchObject({ op: 'mark-processed', processedToId: 'task-1' });
  });
});
