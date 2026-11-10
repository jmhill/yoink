import { describe, expect, it } from 'vitest';
import type { CommitFailure } from '../../../kernel/unit-of-work.js';
import {
  mapProcessToProjectCommit,
  mapProcessToTaskCommit,
  projectPrepareError,
} from './map-commit-failure.js';

const inboxMiss = (owner: 'captures' | 'task-management'): CommitFailure => ({
  kind: 'Conflict',
  owner,
  reason: 'guard-miss',
});

describe('processing commit failures', () => {
  it('maps a captures inbox guard miss to CAPTURE_NOT_IN_INBOX', () => {
    expect(mapProcessToTaskCommit(inboxMiss('captures'), 'cap-1')).toEqual({
      type: 'CAPTURE_NOT_IN_INBOX',
      captureId: 'cap-1',
    });
    expect(
      mapProcessToProjectCommit(inboxMiss('captures'), {
        captureId: 'cap-1',
        projectName: 'Harbor',
      }).type
    ).toBe('CAPTURE_NOT_IN_INBOX');
  });

  it('maps a duplicate project name and leaves other conflicts as storage', () => {
    const duplicate: CommitFailure = {
      kind: 'Conflict',
      owner: 'task-management',
      reason: 'duplicate-name',
    };
    expect(
      mapProcessToProjectCommit(duplicate, { captureId: 'cap-1', projectName: 'Harbor' })
    ).toMatchObject({ type: 'DUPLICATE_PROJECT_NAME', name: 'Harbor' });
    expect(mapProcessToTaskCommit(inboxMiss('task-management'), 'cap-1').type).toBe(
      'STORAGE_ERROR'
    );
  });

  it('keeps proposal-only project refusals off the public process union', () => {
    expect(
      projectPrepareError({
        type: 'PROJECT_PROPOSE_REQUIRES_BOT',
        message: 'Only a bot can propose a project',
      }).type
    ).toBe('STORAGE_ERROR');
  });
});
