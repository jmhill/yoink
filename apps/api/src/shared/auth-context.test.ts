import { describe, it, expect } from 'vitest';
import { actorFromSession, actorFromToken } from './auth-context.js';

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
      via: 'token',
    });
  });

  it('maps an agent token to a bot actor via token', () => {
    expect(actorFromToken(token, 'agent')).toEqual({
      kind: 'bot',
      tokenId: 'token-1',
      userId: 'user-1',
      name: 'test-token',
      via: 'token',
    });
  });
});

describe('actorFromSession', () => {
  it('maps a session to a user actor via session', () => {
    expect(actorFromSession('user-1')).toEqual({
      kind: 'user',
      userId: 'user-1',
      via: 'session',
    });
  });
});
