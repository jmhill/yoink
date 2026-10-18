import { describe, it, expect } from 'vitest';
import { BOT_CANNOT_BE_OWNER_MESSAGE } from '@yoink/api-contracts';
import { decideBotMayHaveRole } from './decide-bot-role.js';

describe('decideBotMayHaveRole', () => {
  it('allows a human to be member, admin, or owner', () => {
    expect(decideBotMayHaveRole('human', 'member').isOk()).toBe(true);
    expect(decideBotMayHaveRole('human', 'admin').isOk()).toBe(true);
    expect(decideBotMayHaveRole('human', 'owner').isOk()).toBe(true);
  });

  it('allows a bot to be a member', () => {
    expect(decideBotMayHaveRole('agent', 'member').isOk()).toBe(true);
  });

  it('refuses a bot as admin', () => {
    const result = decideBotMayHaveRole('agent', 'admin');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_HAVE_PRIVILEGED_ROLE');
      expect(result.error.role).toBe('admin');
      expect(result.error.message).toContain('admin');
    }
  });

  it('refuses a bot as owner', () => {
    const result = decideBotMayHaveRole('agent', 'owner');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_HAVE_PRIVILEGED_ROLE');
      expect(result.error.role).toBe('owner');
      expect(result.error.message).toBe(BOT_CANNOT_BE_OWNER_MESSAGE);
    }
  });
});
