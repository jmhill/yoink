import { describe, it, expect } from 'vitest';
import { isDesignatedMirrorBot } from './mirror-bot.js';

describe('isDesignatedMirrorBot', () => {
  it('allows only the stored member id', () => {
    expect(
      isDesignatedMirrorBot({
        actorUserId: 'bot-1',
        designatedUserId: 'bot-1',
      })
    ).toBe(true);
    expect(
      isDesignatedMirrorBot({
        actorUserId: 'bot-2',
        designatedUserId: 'bot-1',
      })
    ).toBe(false);
    expect(
      isDesignatedMirrorBot({
        actorUserId: 'bot-1',
        designatedUserId: null,
      })
    ).toBe(false);
  });
});
