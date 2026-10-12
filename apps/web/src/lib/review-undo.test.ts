import { describe, expect, it } from 'vitest';
import {
  createdTaskIdFromNextAction,
  nextActionUndoRestore,
  nextActionUndoToast,
  reviewStatusUndoEnabled,
  runNextActionUndo,
  settledResult,
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
});

describe('settledResult', () => {
  it('wraps a resolved promise as ok', async () => {
    await expect(settledResult(Promise.resolve(204))).resolves.toEqual({
      ok: true,
      value: 204,
    });
  });

  it('wraps a rejected promise as an error without throwing', async () => {
    await expect(settledResult(Promise.reject(new Error('no delete')))).resolves.toEqual({
      ok: false,
      error: new Error('no delete'),
    });
  });
});

describe('runNextActionUndo', () => {
  const restore = nextActionUndoRestore({
    previousTaskId: TASK_ID,
    createdTaskId: '550e8400-e29b-41d4-a716-446655440303',
  });

  it('returns restored when the pointer PUT succeeds and nothing was created', async () => {
    const calls: string[] = [];
    const outcome = await runNextActionUndo({
      restore: nextActionUndoRestore({ previousTaskId: TASK_ID, createdTaskId: null }),
      restoreNextAction: async () => {
        calls.push('restore');
        return { status: 200 };
      },
      deleteCreatedTask: async () => {
        calls.push('delete');
        return { status: 204 };
      },
    });

    expect(outcome).toEqual({ kind: 'restored' });
    expect(calls).toEqual(['restore']);
  });

  it('returns restore-failed and does not delete when the pointer PUT rejects', async () => {
    const error = new Error('restore failed');
    const calls: string[] = [];
    const outcome = await runNextActionUndo({
      restore,
      restoreNextAction: async () => {
        calls.push('restore');
        return Promise.reject(error);
      },
      deleteCreatedTask: async () => {
        calls.push('delete');
        return { status: 204 };
      },
    });

    expect(outcome).toEqual({ kind: 'restore-failed', error });
    expect(calls).toEqual(['restore']);
  });

  it('returns delete-failed when the created-task DELETE rejects', async () => {
    const error = new Error('delete failed');
    const outcome = await runNextActionUndo({
      restore,
      restoreNextAction: async () => ({ status: 200 }),
      deleteCreatedTask: async (taskId) => {
        expect(taskId).toBe(restore.createdTaskId);
        return Promise.reject(error);
      },
    });

    expect(outcome).toEqual({ kind: 'delete-failed', error });
  });

  it('returns restored when the pointer PUT and created-task DELETE both succeed', async () => {
    const deleted: string[] = [];
    const outcome = await runNextActionUndo({
      restore,
      restoreNextAction: async () => ({ status: 200 }),
      deleteCreatedTask: async (taskId) => {
        deleted.push(taskId);
        return { status: 204 };
      },
    });

    expect(outcome).toEqual({ kind: 'restored' });
    expect(deleted).toEqual([restore.createdTaskId]);
  });
});

describe('nextActionUndoToast', () => {
  it('shows restored only when both steps succeeded', () => {
    expect(nextActionUndoToast({ outcome: { kind: 'restored' }, networkError: false })).toEqual({
      type: 'success',
      message: 'Next action restored',
    });
  });

  it('shows the delete error instead of restored when DELETE fails', () => {
    expect(
      nextActionUndoToast({
        outcome: { kind: 'delete-failed', error: new Error('no delete') },
        networkError: false,
      })
    ).toEqual({
      type: 'error',
      message: 'Failed to remove the created task',
    });
  });

  it('shows the restore error when the pointer PUT fails', () => {
    expect(
      nextActionUndoToast({
        outcome: { kind: 'restore-failed', error: new Error('no put') },
        networkError: false,
      })
    ).toEqual({
      type: 'error',
      message: 'Failed to restore next action',
    });
  });

  it('shows the network copy for either failed step', () => {
    expect(
      nextActionUndoToast({
        outcome: { kind: 'delete-failed', error: new Error('offline') },
        networkError: true,
      })
    ).toEqual({
      type: 'error',
      message: 'Network error. Please check your connection.',
    });
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
