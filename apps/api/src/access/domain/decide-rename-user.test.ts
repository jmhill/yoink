import { describe, expect, it } from 'vitest';
import { decideRenameUser } from './decide-rename-user.js';

const user = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  email: 'ada@example.com',
  createdAt: '2024-06-15T12:00:00.000Z',
};

describe('decideRenameUser', () => {
  it('plans a guarded name change and keeps the other fields', () => {
    const decision = decideRenameUser({ userId: user.id, user, name: 'Ada' });
    expect(decision.isOk() && decision.value).toEqual({
      kind: 'rename-user',
      userId: user.id,
      name: 'Ada',
    });
  });

  it('does not plan a write when the user is missing', () => {
    const decision = decideRenameUser({
      userId: user.id,
      user: null,
      name: 'Ada',
    });
    expect(decision.isErr() && decision.error).toEqual({
      type: 'USER_NOT_FOUND',
      userId: user.id,
    });
  });
});
