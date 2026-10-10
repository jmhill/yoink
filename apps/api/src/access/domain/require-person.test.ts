import { describe, it, expect } from 'vitest';
import { requirePerson } from './require-person.js';
import { requireWebSessionPerson } from './require-web-session-person.js';

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

describe('requirePerson', () => {
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

describe('requireWebSessionPerson', () => {
  it('allows a session person', () => {
    const result = requireWebSessionPerson(sessionPerson);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(sessionPerson);
    }
  });

  it('refuses a person token', () => {
    const result = requireWebSessionPerson(personToken);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
    }
  });

  it('refuses an agent token', () => {
    const result = requireWebSessionPerson(agentToken);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
    }
  });
});
