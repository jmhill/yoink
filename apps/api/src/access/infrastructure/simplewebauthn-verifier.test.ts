import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { createSimpleWebAuthnVerifier } from './simplewebauthn-verifier.js';

const relyingParty = {
  rpId: 'localhost',
  rpName: 'Test App',
  origin: 'http://localhost:3000',
};

const verifier = () => createSimpleWebAuthnVerifier(relyingParty);

describe('createSimpleWebAuthnVerifier', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('passes relying-party fields and does not pass the challenge secret', async () => {
    vi.mocked(generateRegistrationOptions).mockResolvedValue({
      challenge: 'library',
      rp: { name: 'Yoink', id: 'localhost' },
      user: { id: 'user-id', name: 'user', displayName: 'user' },
      pubKeyCredParams: [],
    });

    const result = await verifier().registrationOptions({
      userName: 'ada@example.com',
      userDisplayName: 'ada@example.com',
      challenge: 'signed-challenge',
      excludeCredentials: [{ id: 'cred-1', transports: ['internal'] }],
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value).toMatchObject({ challenge: 'library' });
    expect(generateRegistrationOptions).toHaveBeenCalledWith({
      rpName: 'Test App',
      rpID: 'localhost',
      userName: 'ada@example.com',
      userDisplayName: 'ada@example.com',
      challenge: 'signed-challenge',
      excludeCredentials: [{ id: 'cred-1', transports: ['internal'] }],
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      attestationType: 'none',
    });
  });

  it('omits allowCredentials for discoverable authentication', async () => {
    vi.mocked(generateAuthenticationOptions).mockResolvedValue({ challenge: 'library' });

    await verifier().authenticationOptions({ challenge: 'signed-challenge' });

    expect(generateAuthenticationOptions).toHaveBeenCalledWith({
      rpID: 'localhost',
      challenge: 'signed-challenge',
      userVerification: 'preferred',
    });
  });

  it('encodes the public key and accepts the challenge encodings the browser sends', async () => {
    const expected = 'signed-challenge';
    let matches: (received: string) => boolean = () => false;
    vi.mocked(verifyRegistrationResponse).mockImplementation(async (options) => {
      const expectedChallenge = options.expectedChallenge;
      if (typeof expectedChallenge === 'function') {
        matches = (received) => expectedChallenge(received) === true;
      }
      return {
        verified: true,
        registrationInfo: {
          fmt: 'none',
          aaguid: '00000000-0000-0000-0000-000000000000',
          credential: {
            id: 'cred-1',
            publicKey: new Uint8Array([1, 2, 3]),
            counter: 0,
            transports: ['internal'],
          },
          credentialType: 'public-key',
          attestationObject: new Uint8Array(),
          userVerified: true,
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
          origin: 'http://localhost:3000',
          rpID: 'localhost',
        },
      };
    });

    const result = await verifier().verifyRegistration({
      response: { id: 'cred-1' },
      expectedChallenge: expected,
    });

    expect(result.isOk() && result.value).toEqual({
      verified: true,
      id: 'cred-1',
      publicKey: Buffer.from([1, 2, 3]).toString('base64url'),
      counter: 0,
      transports: ['internal'],
      deviceType: 'multiDevice',
      backedUp: true,
    });
    expect(matches(expected)).toBe(true);
    const expectedBytes = Buffer.from(expected, 'base64url');
    expect(matches(Buffer.from(expectedBytes).toString('base64'))).toBe(true);
    expect(matches(Buffer.from(expected, 'utf8').toString('base64'))).toBe(true);
    expect(matches('not-the-challenge')).toBe(false);
    expect(vi.mocked(verifyRegistrationResponse).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        expectedOrigin: ['http://localhost:3000'],
        expectedRPID: 'localhost',
        requireUserVerification: true,
      })
    );
  });

  it('keeps an origin list and maps a thrown library error', async () => {
    const listed = createSimpleWebAuthnVerifier({
      ...relyingParty,
      origin: ['http://localhost:3000', 'http://localhost:5173'],
    });
    vi.mocked(verifyAuthenticationResponse).mockRejectedValue(new Error('bad origin'));

    const result = await listed.verifyAuthentication({
      response: { id: 'cred-1' },
      expectedChallenge: 'signed-challenge',
      credential: {
        id: 'cred-1',
        publicKey: Buffer.from([1, 2, 3]).toString('base64url'),
        counter: 4,
        transports: ['internal'],
      },
    });

    expect(result.isErr() && result.error).toEqual({
      type: 'VERIFICATION_FAILED',
      reason: 'bad origin',
    });
    expect(vi.mocked(verifyAuthenticationResponse).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        expectedOrigin: ['http://localhost:3000', 'http://localhost:5173'],
        credential: expect.objectContaining({
          id: 'cred-1',
          counter: 4,
          publicKey: Buffer.from([1, 2, 3]),
        }),
      })
    );
  });

  it('returns verified false without turning it into a thrown error', async () => {
    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
      verified: false,
      authenticationInfo: {
        newCounter: 0,
        credentialID: 'cred-1',
        userVerified: false,
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: false,
        origin: 'http://localhost:3000',
        rpID: 'localhost',
      },
    });

    const result = await verifier().verifyAuthentication({
      response: { id: 'cred-1' },
      expectedChallenge: 'signed-challenge',
      credential: {
        id: 'cred-1',
        publicKey: Buffer.from([1, 2, 3]).toString('base64url'),
        counter: 0,
      },
    });

    expect(result.isOk() && result.value).toEqual({ verified: false });
  });
});
