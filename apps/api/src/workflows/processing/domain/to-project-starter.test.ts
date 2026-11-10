import { describe, expect, it } from 'vitest';
import type { ProcessCaptureToProjectCommand } from './commands.js';
import { toProjectStarter } from './to-project-starter.js';

const command = (
  overrides: Partial<ProcessCaptureToProjectCommand> = {}
): ProcessCaptureToProjectCommand => ({
  id: 'cap-1',
  organizationId: 'org-1',
  createdById: 'user-1',
  name: 'Harbor',
  status: 'active',
  actor: { kind: 'user', userId: 'user-1', via: 'session' },
  ...overrides,
});

describe('toProjectStarter', () => {
  it('passes the name, status, and source capture through', () => {
    expect(toProjectStarter(command({ objective: 'Fix the door' }), { id: 'cap-1' })).toEqual({
      name: 'Harbor',
      objective: 'Fix the door',
      organizationId: 'org-1',
      createdById: 'user-1',
      status: 'active',
      captureId: 'cap-1',
    });
  });

  it('omits an objective that was not supplied', () => {
    expect(toProjectStarter(command({ status: 'someday' }), { id: 'cap-1' })).toEqual({
      name: 'Harbor',
      organizationId: 'org-1',
      createdById: 'user-1',
      status: 'someday',
      captureId: 'cap-1',
    });
  });
});
