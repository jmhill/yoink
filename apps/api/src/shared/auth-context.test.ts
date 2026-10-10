import { describe, it, expect } from 'vitest';
import { actorFromSession, actorFromToken, requirePerson } from './auth-context.js';

const token = {
  id: 'token-1',
  userId: 'user-1',
  name: 'test-token',
};

describe('actorFromToken', () => {
  it('maps a person token to a user actor via token', () => {
    expect(actorFromToken(token, 'human')).toEqual({
      kind: 'user',
      userId: 'user-1',
      via: 'token' as const,
    });
  });

  it('maps an agent token to a bot actor via token', () => {
    expect(actorFromToken(token, 'agent')).toEqual({
      kind: 'bot',
      tokenId: 'token-1',
      userId: 'user-1',
      name: 'test-token',
      via: 'token' as const,
    });
  });
});

describe('actorFromSession', () => {
  it('maps a session to a user actor via session', () => {
    expect(actorFromSession('user-1')).toEqual({
      kind: 'user',
      userId: 'user-1',
      via: 'session' as const,
    });
  });
});

describe('requirePerson', () => {
  const sessionPerson = {
    kind: 'user' as const,
    userId: 'user-1',
    via: 'session' as const,
  };

  const personToken = {
    kind: 'user' as const,
    userId: 'user-1',
    via: 'token' as const,
  };

  const agentToken = {
    kind: 'bot' as const,
    tokenId: 'token-1',
    userId: 'agent-1',
    name: 'Lane',
    via: 'token' as const,
  };

  it('allows a session person', () => {
    const result = requirePerson(sessionPerson);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(sessionPerson);
    }
  });

  it('allows a person token', () => {
    const result = requirePerson(personToken);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(personToken);
    }
  });

  it('refuses an agent token', () => {
    const result = requirePerson(agentToken);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('NOT_A_PERSON');
    }
  });
});
