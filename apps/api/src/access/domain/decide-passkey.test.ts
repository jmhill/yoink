import { describe, expect, it } from 'vitest';
import {
  decideAuthenticationChallenge,
  decideAuthenticationCredential,
  decideAuthenticationCredentials,
  decideDeletePasskeyLast,
  decideDeletePasskeyOwner,
  decideRegistrationChallenge,
  decideRegistrationSubject,
  decideVerifiedAuthentication,
  decideVerifiedRegistration,
} from './decide-passkey.js';
import { planDeletePasskey, planRecordPasskeyUse, planSavePasskey } from './passkey-plan.js';
import type { PasskeyCredential } from './passkey-credential.js';
import type { User } from './user.js';

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const NOW = '2024-01-15T10:00:00.000Z';

const human = (): User => ({
  id: USER_ID,
  email: 'ada@example.com',
  createdAt: NOW,
});

const credential = (id: string, userId: string = USER_ID): PasskeyCredential => ({
  id,
  userId,
  publicKey: 'cHVibGlj',
  counter: 1,
  transports: ['internal'],
  deviceType: 'multiDevice',
  backedUp: true,
  createdAt: NOW,
});

describe('decideRegistrationSubject', () => {
  it('refuses a missing user before credentials are loaded', () => {
    const decision = decideRegistrationSubject({ userId: USER_ID, user: null });
    expect(decision.isErr() && decision.error.type).toBe('USER_NOT_FOUND');
  });

  it('refuses an agent', () => {
    const decision = decideRegistrationSubject({
      userId: USER_ID,
      user: { ...human(), kind: 'agent', email: `agent-${USER_ID}@yoink.invalid` },
    });
    expect(decision.isErr() && decision.error.type).toBe('AGENT_CANNOT_USE_PASSKEY');
  });

  it('keeps a human', () => {
    const decision = decideRegistrationSubject({ userId: USER_ID, user: human() });
    expect(decision.isOk() && decision.value.email).toBe('ada@example.com');
  });
});

describe('decideRegistrationChallenge', () => {
  it('maps expiry and a bad signature before the user check', () => {
    expect(
      decideRegistrationChallenge({
        userId: USER_ID,
        skipUserIdCheck: false,
        failure: 'expired',
      })._unsafeUnwrapErr().type
    ).toBe('CHALLENGE_EXPIRED');
    expect(
      decideRegistrationChallenge({
        userId: USER_ID,
        skipUserIdCheck: true,
        failure: 'invalid',
      })._unsafeUnwrapErr()
    ).toEqual({ type: 'VERIFICATION_FAILED', reason: 'Invalid challenge' });
  });

  it('refuses a challenge minted for someone else', () => {
    const decision = decideRegistrationChallenge({
      userId: USER_ID,
      skipUserIdCheck: false,
      failure: null,
      challengeUserId: 'other',
    });
    expect(decision.isErr() && decision.error).toEqual({
      type: 'VERIFICATION_FAILED',
      reason: 'Challenge user mismatch',
    });
  });

  it('skips the user check for signup', () => {
    const decision = decideRegistrationChallenge({
      userId: USER_ID,
      skipUserIdCheck: true,
      failure: null,
      challengeUserId: 'ada@example.com',
    });
    expect(decision.isOk()).toBe(true);
  });
});

describe('planSavePasskey', () => {
  it('copies the verified material and leaves lastUsedAt unset', () => {
    const refused = decideVerifiedRegistration({ verified: false });
    expect(refused.isErr() && refused.error).toEqual({
      type: 'VERIFICATION_FAILED',
      reason: 'Registration verification failed',
    });

    const material = decideVerifiedRegistration({
      verified: true,
      id: 'cred-1',
      publicKey: 'cHVibGlj',
      counter: 0,
      transports: ['internal'],
      deviceType: 'multiDevice',
      backedUp: true,
    });
    expect(material.isOk()).toBe(true);
    if (material.isErr()) {
      return;
    }

    expect(
      planSavePasskey({
        userId: USER_ID,
        credentialName: 'Laptop',
        now: NOW,
        material: material.value,
      })
    ).toEqual({
      kind: 'save-passkey',
      credential: {
        id: 'cred-1',
        userId: USER_ID,
        publicKey: 'cHVibGlj',
        counter: 0,
        transports: ['internal'],
        deviceType: 'multiDevice',
        backedUp: true,
        name: 'Laptop',
        createdAt: NOW,
        lastUsedAt: undefined,
      },
    });
  });
});

describe('decideAuthentication', () => {
  it('treats a named user with no credentials as missing', () => {
    const decision = decideAuthenticationCredentials({ userId: USER_ID, credentials: [] });
    expect(decision.isErr() && decision.error.type).toBe('USER_NOT_FOUND');
  });

  it('keeps id and transports for allowCredentials', () => {
    const decision = decideAuthenticationCredentials({
      userId: USER_ID,
      credentials: [credential('cred-1')],
    });
    expect(decision.isOk() && decision.value).toEqual([
      { id: 'cred-1', transports: ['internal'] },
    ]);
  });

  it('refuses a missing credential before verify', () => {
    const decision = decideAuthenticationCredential({
      credentialId: 'missing',
      credential: null,
    });
    expect(decision.isErr() && decision.error).toEqual({
      type: 'CREDENTIAL_NOT_FOUND',
      credentialId: 'missing',
    });
  });

  it('plans the new counter and the clock together', () => {
    expect(decideAuthenticationChallenge({ failure: 'expired' })._unsafeUnwrapErr().type).toBe(
      'CHALLENGE_EXPIRED'
    );
    const verified = decideVerifiedAuthentication({ verified: true, newCounter: 6 });
    expect(verified.isOk()).toBe(true);
    if (verified.isErr()) {
      return;
    }
    expect(
      planRecordPasskeyUse({
        credentialId: 'cred-1',
        newCounter: verified.value.newCounter,
        lastUsedAt: NOW,
      })
    ).toEqual({
      kind: 'record-passkey-use',
      credentialId: 'cred-1',
      counter: 6,
      lastUsedAt: NOW,
    });
    expect(decideVerifiedAuthentication({ verified: false })._unsafeUnwrapErr()).toEqual({
      type: 'VERIFICATION_FAILED',
      reason: 'Authentication verification failed',
    });
  });
});

describe('decideDeletePasskey', () => {
  it('refuses a missing credential and someone else\'s credential before the list', () => {
    expect(
      decideDeletePasskeyOwner({
        credentialId: 'missing',
        userId: USER_ID,
        credential: null,
      })._unsafeUnwrapErr().type
    ).toBe('CREDENTIAL_NOT_FOUND');
    expect(
      decideDeletePasskeyOwner({
        credentialId: 'cred-1',
        userId: USER_ID,
        credential: credential('cred-1', 'other'),
      })._unsafeUnwrapErr()
    ).toEqual({
      type: 'CREDENTIAL_OWNERSHIP_ERROR',
      credentialId: 'cred-1',
      userId: USER_ID,
    });
  });

  it('refuses the last passkey and plans a delete when another remains', () => {
    expect(
      decideDeletePasskeyLast({
        credentialId: 'cred-1',
        userId: USER_ID,
        credentials: [credential('cred-1')],
      })._unsafeUnwrapErr().type
    ).toBe('CANNOT_DELETE_LAST_PASSKEY');
    expect(
      decideDeletePasskeyLast({
        credentialId: 'cred-1',
        userId: USER_ID,
        credentials: [credential('cred-1'), credential('cred-2')],
      })._unsafeUnwrap()
    ).toEqual(planDeletePasskey('cred-1'));
  });
});
