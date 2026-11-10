import { describe, it, expect, beforeEach } from 'vitest';
import { errAsync } from 'neverthrow';
import { createFakeClock } from '@yoink/infrastructure';
import { createPasskeyService, type PasskeyService } from './handle-passkey.js';
import { createChallengeManager } from '../domain/challenge.js';
import { createFakePasskeyCredentialStore } from '../infrastructure/fake-passkey-credential-store.js';
import { createFakeWebAuthnVerifier } from '../infrastructure/fake-webauthn-verifier.js';
import { createFakeUserStore } from '../infrastructure/fake-user-store.js';
import { createUserService } from '../domain/user-service.js';
import type { User } from '../domain/user.js';

const TEST_USER: User = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'test@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const CHALLENGE_SECRET = 'test-secret-that-is-at-least-32-bytes-long-for-hmac';

const verifiedRegistration = {
  verified: true as const,
  id: 'new-credential-id',
  publicKey: Buffer.from([1, 2, 3]).toString('base64url'),
  counter: 0,
  transports: ['internal', 'hybrid'] as const,
  deviceType: 'multiDevice' as const,
  backedUp: true,
};

describe('createPasskeyService', () => {
  let service: PasskeyService;
  let credentialStore: ReturnType<typeof createFakePasskeyCredentialStore>;
  let userStore: ReturnType<typeof createFakeUserStore>;
  let clock: ReturnType<typeof createFakeClock>;
  let verifier: ReturnType<typeof createFakeWebAuthnVerifier>;

  beforeEach(() => {
    clock = createFakeClock(new Date('2024-01-01T00:00:00.000Z'));
    credentialStore = createFakePasskeyCredentialStore();
    userStore = createFakeUserStore({ initialUsers: [TEST_USER] });
    verifier = createFakeWebAuthnVerifier();
    const userService = createUserService({ userStore });

    service = createPasskeyService({
      credentialStore,
      userService,
      clock,
      verifier,
      challenges: createChallengeManager({ secret: CHALLENGE_SECRET, clock }),
    });
  });

  describe('generateRegistrationOptions', () => {
    it('generates options for existing user', async () => {
      const mockOptions = {
        challenge: 'test-challenge',
        rp: { name: 'Test App', id: 'localhost' },
      };
      verifier.setRegistrationOptions(mockOptions);

      const result = await service.generateRegistrationOptions(TEST_USER.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.options).toEqual(mockOptions);
        expect(result.value.challenge).toBeDefined();
        expect(typeof result.value.challenge).toBe('string');
      }
    });

    it('rejects passkey registration for agent principals', async () => {
      const agent: User = {
        id: '550e8400-e29b-41d4-a716-446655440099',
        email: 'agent-550e8400-e29b-41d4-a716-446655440099@yoink.invalid',
        name: 'Vault bot',
        kind: 'agent',
        createdAt: '2024-01-01T00:00:00.000Z',
      };
      await userStore.save(agent);

      const result = await service.generateRegistrationOptions(agent.id);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('AGENT_CANNOT_USE_PASSKEY');
      }
      expect(verifier.registrationOptionCalls).toHaveLength(0);
    });

    it('returns error for non-existent user', async () => {
      const result = await service.generateRegistrationOptions('non-existent-user');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });

    it('excludes existing credentials from options', async () => {
      await credentialStore.save({
        id: 'existing-cred-id',
        userId: TEST_USER.id,
        publicKey: 'public-key',
        counter: 0,
        transports: ['internal'],
        deviceType: 'multiDevice',
        backedUp: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      await service.generateRegistrationOptions(TEST_USER.id);

      expect(verifier.registrationOptionCalls[0]?.excludeCredentials).toEqual([
        { id: 'existing-cred-id', transports: ['internal'] },
      ]);
      expect(verifier.registrationOptionCalls[0]?.userName).toBe(TEST_USER.email);
    });
  });

  describe('generateSignupRegistrationOptions', () => {
    it('generates options for new user signup (no existing user required)', async () => {
      const mockOptions = {
        challenge: 'test-challenge',
        rp: { name: 'Test App', id: 'localhost' },
      };
      verifier.setRegistrationOptions(mockOptions);

      const result = await service.generateSignupRegistrationOptions({
        email: 'alice@example.com',
        identifier: 'alice@example.com',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.options).toEqual(mockOptions);
        expect(result.value.challenge).toBeDefined();
        expect(typeof result.value.challenge).toBe('string');
      }
    });

    it('generates options with empty excludeCredentials (new user)', async () => {
      await service.generateSignupRegistrationOptions({
        email: 'alice@example.com',
        identifier: 'alice@example.com',
      });

      expect(verifier.registrationOptionCalls[0]).toEqual(
        expect.objectContaining({
          userName: 'alice@example.com',
          userDisplayName: 'alice@example.com',
          excludeCredentials: [],
        })
      );
    });
  });

  describe('verifyRegistration', () => {
    it('saves credential on successful verification', async () => {
      const optionsResult = await service.generateRegistrationOptions(TEST_USER.id);
      expect(optionsResult.isOk()).toBe(true);
      const challenge = optionsResult._unsafeUnwrap().challenge;
      verifier.setRegistrationVerification(verifiedRegistration);

      const result = await service.verifyRegistration({
        userId: TEST_USER.id,
        challenge,
        response: { id: 'new-credential-id' },
        credentialName: 'My MacBook',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe('new-credential-id');
        expect(result.value.userId).toBe(TEST_USER.id);
        expect(result.value.name).toBe('My MacBook');
        expect(result.value.deviceType).toBe('multiDevice');
        expect(result.value.backedUp).toBe(true);
        expect(result.value.publicKey).toBe(verifiedRegistration.publicKey);
        expect(result.value.createdAt).toBe('2024-01-01T00:00:00.000Z');
      }

      const saved = await credentialStore.findById('new-credential-id');
      expect(saved.isOk()).toBe(true);
      if (saved.isOk()) {
        expect(saved.value).not.toBeNull();
      }
    });

    it('plans a credential without writing it', async () => {
      const optionsResult = await service.generateSignupRegistrationOptions({
        email: 'alice@example.com',
        identifier: 'alice@example.com',
      });
      const challenge = optionsResult._unsafeUnwrap().challenge;
      verifier.setRegistrationVerification(verifiedRegistration);

      const planned = await service.planRegistrationCredential({
        userId: TEST_USER.id,
        challenge,
        response: {},
        skipUserIdCheck: true,
      });

      expect(planned.isOk() && planned.value.id).toBe('new-credential-id');
      const saved = await credentialStore.findById('new-credential-id');
      expect(saved.isOk() && saved.value).toBeNull();
    });

    it('rejects expired challenge', async () => {
      const optionsResult = await service.generateRegistrationOptions(TEST_USER.id);
      const challenge = optionsResult._unsafeUnwrap().challenge;
      clock.advanceBy(6 * 60 * 1000);

      const result = await service.verifyRegistration({
        userId: TEST_USER.id,
        challenge,
        response: {},
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CHALLENGE_EXPIRED');
      }
    });

    it('rejects challenge for different user', async () => {
      const optionsResult = await service.generateRegistrationOptions(TEST_USER.id);
      const challenge = optionsResult._unsafeUnwrap().challenge;

      const result = await service.verifyRegistration({
        userId: 'different-user-id',
        challenge,
        response: {},
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('VERIFICATION_FAILED');
      }
    });

    it('returns error when verification fails', async () => {
      const optionsResult = await service.generateRegistrationOptions(TEST_USER.id);
      const challenge = optionsResult._unsafeUnwrap().challenge;
      verifier.setRegistrationVerification({ verified: false });

      const result = await service.verifyRegistration({
        userId: TEST_USER.id,
        challenge,
        response: {},
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('VERIFICATION_FAILED');
      }
    });

    it('maps a unit-of-work storage failure to the same credential storage error', async () => {
      const optionsResult = await service.generateRegistrationOptions(TEST_USER.id);
      const challenge = optionsResult._unsafeUnwrap().challenge;
      verifier.setRegistrationVerification(verifiedRegistration);
      const failingService = createPasskeyService({
        credentialStore,
        userService: createUserService({ userStore }),
        clock,
        verifier,
        challenges: createChallengeManager({ secret: CHALLENGE_SECRET, clock }),
        unitOfWork: {
          commit: () =>
            errAsync({
              kind: 'Storage',
              owner: 'access',
              owners: ['access'],
              reason: 'disk',
            }),
        },
      });

      const result = await failingService.verifyRegistration({
        userId: TEST_USER.id,
        challenge,
        response: {},
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr() && result.error.type === 'PASSKEY_CREDENTIAL_STORAGE_ERROR') {
        expect(result.error.message).toBe('Failed to save passkey credential');
      } else {
        expect(result.isErr() && result.error.type).toBe('PASSKEY_CREDENTIAL_STORAGE_ERROR');
      }
    });
  });

  describe('generateAuthenticationOptions', () => {
    it('generates options for discoverable credentials', async () => {
      const mockOptions = { challenge: 'test-challenge', rpId: 'localhost' };
      verifier.setAuthenticationOptions(mockOptions);

      const result = await service.generateAuthenticationOptions();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.options).toEqual(mockOptions);
        expect(result.value.challenge).toBeDefined();
      }
      expect(verifier.authenticationOptionCalls[0]?.allowCredentials).toBeUndefined();
    });

    it('generates options with allowCredentials for specific user', async () => {
      await credentialStore.save({
        id: 'cred-1',
        userId: TEST_USER.id,
        publicKey: 'pk',
        counter: 0,
        transports: ['internal'],
        deviceType: 'multiDevice',
        backedUp: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const result = await service.generateAuthenticationOptions(TEST_USER.id);

      expect(result.isOk()).toBe(true);
      expect(verifier.authenticationOptionCalls[0]?.allowCredentials).toEqual([
        { id: 'cred-1', transports: ['internal'] },
      ]);
    });

    it('returns error when user has no credentials', async () => {
      const result = await service.generateAuthenticationOptions(TEST_USER.id);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });
  });

  describe('verifyAuthentication', () => {
    it('verifies authentication and updates counter', async () => {
      await credentialStore.save({
        id: 'cred-1',
        userId: TEST_USER.id,
        publicKey: Buffer.from([1, 2, 3]).toString('base64url'),
        counter: 5,
        transports: ['internal'],
        deviceType: 'multiDevice',
        backedUp: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const optionsResult = await service.generateAuthenticationOptions(TEST_USER.id);
      const challenge = optionsResult._unsafeUnwrap().challenge;
      verifier.setAuthenticationVerification({ verified: true, newCounter: 6 });

      const result = await service.verifyAuthentication({
        challenge,
        response: { id: 'cred-1' },
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.userId).toBe(TEST_USER.id);
        expect(result.value.credentialId).toBe('cred-1');
      }

      const updated = await credentialStore.findById('cred-1');
      expect(updated.isOk()).toBe(true);
      if (updated.isOk() && updated.value) {
        expect(updated.value.counter).toBe(6);
        expect(updated.value.lastUsedAt).toBe('2024-01-01T00:00:00.000Z');
      }
    });

    it('rejects expired challenge', async () => {
      await credentialStore.save({
        id: 'cred-1',
        userId: TEST_USER.id,
        publicKey: Buffer.from([1, 2, 3]).toString('base64url'),
        counter: 0,
        deviceType: 'multiDevice',
        backedUp: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const optionsResult = await service.generateAuthenticationOptions(TEST_USER.id);
      const challenge = optionsResult._unsafeUnwrap().challenge;
      clock.advanceBy(6 * 60 * 1000);

      const result = await service.verifyAuthentication({
        challenge,
        response: { id: 'cred-1' },
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CHALLENGE_EXPIRED');
      }
    });

    it('rejects unknown credential', async () => {
      const optionsResult = await service.generateAuthenticationOptions();
      const challenge = optionsResult._unsafeUnwrap().challenge;

      const result = await service.verifyAuthentication({
        challenge,
        response: { id: 'unknown-cred' },
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CREDENTIAL_NOT_FOUND');
      }
    });
  });

  describe('listCredentials', () => {
    it('returns credentials for user', async () => {
      await credentialStore.save({
        id: 'cred-1',
        userId: TEST_USER.id,
        publicKey: 'pk1',
        counter: 0,
        deviceType: 'multiDevice',
        backedUp: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      await credentialStore.save({
        id: 'cred-2',
        userId: TEST_USER.id,
        publicKey: 'pk2',
        counter: 0,
        deviceType: 'singleDevice',
        backedUp: false,
        createdAt: '2024-01-02T00:00:00.000Z',
      });

      const result = await service.listCredentials(TEST_USER.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
      }
    });
  });

  describe('deleteCredential', () => {
    it('deletes a credential', async () => {
      await credentialStore.save({
        id: 'cred-1',
        userId: TEST_USER.id,
        publicKey: 'pk',
        counter: 0,
        deviceType: 'multiDevice',
        backedUp: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const result = await service.deleteCredential('cred-1');

      expect(result.isOk()).toBe(true);

      const findResult = await credentialStore.findById('cred-1');
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toBeNull();
      }
    });
  });

  describe('deleteCredentialForUser', () => {
    it('deletes a credential when user has multiple passkeys', async () => {
      await credentialStore.save({
        id: 'cred-1',
        userId: TEST_USER.id,
        publicKey: 'pk1',
        counter: 0,
        deviceType: 'multiDevice',
        backedUp: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      await credentialStore.save({
        id: 'cred-2',
        userId: TEST_USER.id,
        publicKey: 'pk2',
        counter: 0,
        deviceType: 'multiDevice',
        backedUp: true,
        createdAt: '2024-01-02T00:00:00.000Z',
      });

      const result = await service.deleteCredentialForUser({
        credentialId: 'cred-1',
        userId: TEST_USER.id,
      });

      expect(result.isOk()).toBe(true);

      const findResult = await credentialStore.findById('cred-1');
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toBeNull();
      }
    });

    it('returns error when trying to delete last passkey', async () => {
      await credentialStore.save({
        id: 'only-cred',
        userId: TEST_USER.id,
        publicKey: 'pk',
        counter: 0,
        deviceType: 'multiDevice',
        backedUp: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const result = await service.deleteCredentialForUser({
        credentialId: 'only-cred',
        userId: TEST_USER.id,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CANNOT_DELETE_LAST_PASSKEY');
      }

      const findResult = await credentialStore.findById('only-cred');
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).not.toBeNull();
      }
    });

    it('returns error when credential does not exist', async () => {
      const result = await service.deleteCredentialForUser({
        credentialId: 'non-existent',
        userId: TEST_USER.id,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CREDENTIAL_NOT_FOUND');
      }
    });

    it('returns error when user does not own the credential', async () => {
      await credentialStore.save({
        id: 'other-user-cred',
        userId: 'other-user-id',
        publicKey: 'pk',
        counter: 0,
        deviceType: 'multiDevice',
        backedUp: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const result = await service.deleteCredentialForUser({
        credentialId: 'other-user-cred',
        userId: TEST_USER.id,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CREDENTIAL_OWNERSHIP_ERROR');
      }
    });
  });
});
