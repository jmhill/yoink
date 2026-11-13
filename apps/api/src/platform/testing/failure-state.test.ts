import { describe, expect, it } from 'vitest';
import { clearFailureState, readFailureState, registerFailureState } from './failure-state.js';

describe('failure state', () => {
  it('reads the store snapshot at failure time', async () => {
    clearFailureState();
    const tokens: { id: string }[] = [{ id: 't1' }];
    registerFailureState('fakeTokenStore', () => tokens.map((token) => ({ ...token })));
    tokens.push({ id: 't2' });

    await expect(readFailureState()).resolves.toEqual({
      'fakeTokenStore#0': [{ id: 't1' }, { id: 't2' }],
    });

    clearFailureState();
    await expect(readFailureState()).resolves.toEqual({});
  });
});
