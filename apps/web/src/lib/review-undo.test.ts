import { afterEach, describe, expect, it } from 'vitest';
import {
  clearNextActionUndo,
  createdTaskIdFromNextAction,
  nextActionUndoRestore,
  queueNextActionUndo,
  reviewStatusUndoEnabled,
  takeNextActionUndo,
} from './review-undo';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440010';
const TASK_ID = '550e8400-e29b-41d4-a716-446655440101';

const project = {
  id: PROJECT_ID,
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  createdById: '550e8400-e29b-41d4-a716-446655440002',
  name: 'House storage',
  status: 'active' as const,
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: TASK_ID,
  notebookPages: [],
  createdAt: '2026-10-11T13:00:00.000Z',
  lastChangedAt: '2026-10-11T13:00:00.000Z',
  lastChangedBy: null,
};

describe('createdTaskIdFromNextAction', () => {
  it('returns the created task id only when the body asked for a new task', () => {
    expect(
      createdTaskIdFromNextAction({
        body: { newTask: { title: 'Box the attic' } },
        result: { project, task: { id: TASK_ID, title: 'Box the attic' } },
      })
    ).toBe(TASK_ID);
  });

  it('returns null when an existing task was picked', () => {
    expect(
      createdTaskIdFromNextAction({
        body: { taskId: TASK_ID },
        result: { project, task: { id: TASK_ID, title: 'Box the attic' } },
      })
    ).toBeNull();
  });

  it('falls back to the project pointer when a new-task response omitted the task', () => {
    expect(
      createdTaskIdFromNextAction({
        body: { newTask: { title: 'Box the attic' } },
        result: { project },
      })
    ).toBe(TASK_ID);
  });

  it('returns null when a new-task response has no created task and no pointer', () => {
    expect(
      createdTaskIdFromNextAction({
        body: { newTask: { title: 'Box the attic' } },
        result: { project: { ...project, nextActionTaskId: null } },
      })
    ).toBeNull();
  });
});

describe('nextActionUndoRestore', () => {
  afterEach(() => {
    clearNextActionUndo();
  });

  it('clears the pointer when the project had no next action at SET time', () => {
    expect(nextActionUndoRestore({ previousTaskId: null, createdTaskId: TASK_ID })).toEqual({
      body: { taskId: null },
      createdTaskId: TASK_ID,
    });
  });

  it('restores the SET-time task id, not a later next action', () => {
    const laterTaskId = '550e8400-e29b-41d4-a716-446655440202';
    const capturedAtSet = nextActionUndoRestore({
      previousTaskId: project.nextActionTaskId,
      createdTaskId: null,
    });
    const afterOptimisticOrInvalidate = { ...project, nextActionTaskId: laterTaskId };

    expect(capturedAtSet).toEqual({
      body: { taskId: TASK_ID },
      createdTaskId: null,
    });
    expect(capturedAtSet.body).not.toEqual({
      taskId: afterOptimisticOrInvalidate.nextActionTaskId,
    });
  });

  it('hands the queued restore to any later take, then clears', () => {
    clearNextActionUndo();
    const restore = nextActionUndoRestore({
      previousTaskId: null,
      createdTaskId: TASK_ID,
    });
    queueNextActionUndo({ projectId: PROJECT_ID, restore });

    expect(takeNextActionUndo(PROJECT_ID, { newTask: { title: 'Later' } })).toBeNull();
    expect(takeNextActionUndo('00000000-0000-0000-0000-000000000099', { taskId: null })).toBeNull();
    expect(takeNextActionUndo(PROJECT_ID, { taskId: TASK_ID })).toBeNull();
    expect(takeNextActionUndo(PROJECT_ID, { taskId: null })).toEqual({
      projectId: PROJECT_ID,
      restore,
    });
    expect(takeNextActionUndo(PROJECT_ID, { taskId: null })).toBeNull();
  });
});

describe('reviewStatusUndoEnabled', () => {
  it('is false only for Done', () => {
    expect(reviewStatusUndoEnabled('active')).toBe(true);
    expect(reviewStatusUndoEnabled('waiting')).toBe(true);
    expect(reviewStatusUndoEnabled('someday')).toBe(true);
    expect(reviewStatusUndoEnabled('done')).toBe(false);
  });
});
