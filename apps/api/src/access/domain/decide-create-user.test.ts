import { describe, expect, it } from 'vitest';
import { decideCreateUser, planCreateUser } from './decide-create-user.js';

const ID = '550e8400-e29b-41d4-a716-446655440099';
const CREATED = '2024-06-01T00:00:00.000Z';

describe('decideCreateUser', () => {
  it('keeps the id, email, and createdAt and leaves name and kind unset', () => {
    expect(
      decideCreateUser({
        id: ID,
        email: 'new@example.com',
        createdAt: CREATED,
      })
    ).toEqual({
      id: ID,
      email: 'new@example.com',
      createdAt: CREATED,
    });
  });

  it('keeps a name and kind the command already has', () => {
    expect(
      decideCreateUser({
        id: ID,
        email: 'bot@example.com',
        name: 'Ada',
        kind: 'agent',
        createdAt: CREATED,
      })
    ).toEqual({
      id: ID,
      email: 'bot@example.com',
      name: 'Ada',
      kind: 'agent',
      createdAt: CREATED,
    });
  });
});

describe('planCreateUser', () => {
  it('copies the decision onto a create-user plan', () => {
    const plan = planCreateUser(
      decideCreateUser({
        id: ID,
        email: 'new@example.com',
        createdAt: CREATED,
      })
    );

    expect(plan).toEqual({
      kind: 'create-user',
      user: {
        id: ID,
        email: 'new@example.com',
        createdAt: CREATED,
      },
    });
  });

  it('does not invent a name or a kind the command omitted', () => {
    const plan = planCreateUser(
      decideCreateUser({
        id: ID,
        email: 'new@example.com',
        createdAt: CREATED,
      })
    );

    expect(plan.user).not.toHaveProperty('name');
    expect(plan.user).not.toHaveProperty('kind');
    expect(plan.kind).toBe('create-user');
  });
});
