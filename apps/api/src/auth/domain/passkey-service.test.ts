import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeClock } from '@yoink/infrastructure';
import { createPasskeyService, type PasskeyService } from './passkey-service.js';
import { createFakePasskeyCredentialStore } from '../infrastructure/fake-passkey-credential-store.js';
import { createFakeUserStore } from '../infrastructure/fake-user-store.js';
import type { User } from './user.js';
import type { WebAuthnConfig } from '../../config/schema.js';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';

// Mock the simplewebauthn functions
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

import {
  generateRegistrationOptions as mockGenerateRegOpts,
  verifyRegistrationResponse as mockVerifyReg,
  generateAuthenticationOptions as mockGenerateAuthOpts,
  verifyAuthenticationResponse as mockVerifyAuth,
} from '@simplewebauthn/server';

const TEST_USER: User = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  organizationId: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const TEST_CONFIG: WebAuthnConfig = {
  rpId: 'localhost',
  rpName: 'Test App',
  origin: 'http://localhost:3000',
  challengeSecret: 'test-secret-that-is-at-least-32-bytes-long-for-hmac',
};

describe('createPasskeyService', () => {
  let service: PasskeyService;
  let credentialStore: ReturnType<typeof createFakePasskeyCredentialStore>;
  let userStore: ReturnType<typeof createFakeUserStore>;
  let clock: ReturnType<typeof createFakeClock>;

  beforeEach(() => {
    vi.resetAllMocks();
    
    clock = createFakeClock(new Date('2024-01-01T00:00:00.000Z'));
    credentialStore = createFakePasskeyCredentialStore();
    userStore = createFakeUserStore({ initialUsers: [TEST_USER] });
    
    service = createPasskeyService({
      credentialStore,
      userStore,
      config: TEST_CONFIG,
      clock,
    });
  });

  describe('generateRegistrationOptions', () => {
    it('generates options for existing user', async () => {
      const mockOptions = {
        challenge: 'test-challenge',
        rp: { name: 'Test App', id: 'localhost' },
        user: { id: 'user-id', name: 'test@example.com', displayName: 'test@example.com' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      };
      
      vi.mocked(mockGenerateRegOpts).mockResolvedValue(mockOptions as any);

      const result = await service.generateRegistrationOptions(TEST_USER.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.options).toEqual(mockOptions);
        expect(result.value.challenge).toBeDefined();
        expect(typeof result.value.challenge).toBe('string');
      }
    });

    it('returns error for non-existent user', async () => {
      const result = await service.generateRegistrationOptions('non-existent-user');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });

    it('excludes existing credentials from options', async () => {
      // Add existing credential
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

      vi.mocked(mockGenerateRegOpts).mockResolvedValue({
        challenge: 'test-challenge',
      } as any);

      await service.generateRegistrationOptions(TEST_USER.id);

      expect(mockGenerateRegOpts).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeCredentials: [
            expect.objectContaining({ id: 'existing-cred-id' }),
          ],
        })
      );
    });
  });

  describe('verifyRegistration', () => {
    it('saves credential on successful verification', async () => {
      // First generate registration options to get a valid challenge
      vi.mocked(mockGenerateRegOpts).mockResolvedValue({ challenge: 'test' } as any);
      const optionsResult = await service.generateRegistrationOptions(TEST_USER.id);
      expect(optionsResult.isOk()).toBe(true);
      const challenge = optionsResult._unsafeUnwrap().challenge;

      // Mock successful verification
      vi.mocked(mockVerifyReg).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: 'new-credential-id',
            publicKey: new Uint8Array([1, 2, 3]),
            counter: 0,
            transports: ['internal', 'hybrid'],
          },
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
        },
      } as any);

      const response: RegistrationResponseJSON = {
        id: 'new-credential-id',
        rawId: 'new-credential-id',
        response: {
          clientDataJSON: 'base64-encoded',
          attestationObject: 'base64-encoded',
        },
        type: 'public-key',
        clientExtensionResults: {},
      };

      const result = await service.verifyRegistration({
        userId: TEST_USER.id,
        challenge,
        response,
        credentialName: 'My MacBook',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe('new-credential-id');
        expect(result.value.userId).toBe(TEST_USER.id);
        expect(result.value.name).toBe('My MacBook');
        expect(result.value.deviceType).toBe('multiDevice');
        expect(result.value.backedUp).toBe(true);
      }

      // Verify credential was saved
      const saved = await credentialStore.findById('new-credential-id');
      expect(saved.isOk()).toBe(true);
      if (saved.isOk()) {
        expect(saved.value).not.toBeNull();
      }
    });

    it('rejects expired challenge', async () => {
      // Generate challenge
      vi.mocked(mockGenerateRegOpts).mockResolvedValue({ challenge: 'test' } as any);
      const optionsResult = await service.generateRegistrationOptions(TEST_USER.id);
      const challenge = optionsResult._unsafeUnwrap().challenge;

      // Advance past expiry
      clock.advanceBy(6 * 60 * 1000); // 6 minutes

      const result = await service.verifyRegistration({
        userId: TEST_USER.id,
        challenge,
        response: {} as any,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CHALLENGE_EXPIRED');
      }
    });

    it('rejects challenge for different user', async () => {
      // Generate challenge for TEST_USER
      vi.mocked(mockGenerateRegOpts).mockResolvedValue({ challenge: 'test' } as any);
      const optionsResult = await service.generateRegistrationOptions(TEST_USER.id);
      const challenge = optionsResult._unsafeUnwrap().challenge;

      // Try to use it for different user
      const result = await service.verifyRegistration({
        userId: 'different-user-id',
        challenge,
        response: {} as any,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('VERIFICATION_FAILED');
      }
    });

    it('returns error when verification fails', async () => {
      vi.mocked(mockGenerateRegOpts).mockResolvedValue({ challenge: 'test' } as any);
      const optionsResult = await service.generateRegistrationOptions(TEST_USER.id);
      const challenge = optionsResult._unsafeUnwrap().challenge;

      vi.mocked(mockVerifyReg).mockResolvedValue({
        verified: false,
      } as any);

      const result = await service.verifyRegistration({
        userId: TEST_USER.id,
        challenge,
        response: {} as any,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('VERIFICATION_FAILED');
      }
    });
  });

  describe('generateAuthenticationOptions', () => {
    it('generates options for discoverable credentials', async () => {
      const mockOptions = {
        challenge: 'test-challenge',
        rpId: 'localhost',
      };
      
      vi.mocked(mockGenerateAuthOpts).mockResolvedValue(mockOptions as any);

      const result = await service.generateAuthenticationOptions();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.options).toEqual(mockOptions);
        expect(result.value.challenge).toBeDefined();
      }
    });

    it('generates options with allowCredentials for specific user', async () => {
      // Add credentials for user
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

      vi.mocked(mockGenerateAuthOpts).mockResolvedValue({
        challenge: 'test-challenge',
      } as any);

      const result = await service.generateAuthenticationOptions(TEST_USER.id);

      expect(result.isOk()).toBe(true);
      expect(mockGenerateAuthOpts).toHaveBeenCalledWith(
        expect.objectContaining({
          allowCredentials: [expect.objectContaining({ id: 'cred-1' })],
        })
      );
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
      // Save existing credential
      const existingCred = {
        id: 'cred-1',
        userId: TEST_USER.id,
        publicKey: Buffer.from([1, 2, 3]).toString('base64url'),
        counter: 5,
        transports: ['internal'] as ('usb' | 'ble' | 'nfc' | 'internal' | 'hybrid')[],
        deviceType: 'multiDevice' as const,
        backedUp: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      };
      await credentialStore.save(existingCred);

      // Generate challenge
      vi.mocked(mockGenerateAuthOpts).mockResolvedValue({ challenge: 'test' } as any);
      const optionsResult = await service.generateAuthenticationOptions(TEST_USER.id);
      const challenge = optionsResult._unsafeUnwrap().challenge;

      // Mock successful verification
      vi.mocked(mockVerifyAuth).mockResolvedValue({
        verified: true,
        authenticationInfo: {
          credentialID: 'cred-1',
          newCounter: 6,
          userVerified: true,
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
          origin: 'http://localhost:3000',
          rpID: 'localhost',
        },
      } as any);

      const response: AuthenticationResponseJSON = {
        id: 'cred-1',
        rawId: 'cred-1',
        response: {
          clientDataJSON: 'base64',
          authenticatorData: 'base64',
          signature: 'base64',
        },
        type: 'public-key',
        clientExtensionResults: {},
      };

      const result = await service.verifyAuthentication({
        challenge,
        response,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.userId).toBe(TEST_USER.id);
        expect(result.value.credentialId).toBe('cred-1');
      }

      // Check counter was updated
      const updated = await credentialStore.findById('cred-1');
      expect(updated.isOk()).toBe(true);
      if (updated.isOk() && updated.value) {
        expect(updated.value.counter).toBe(6);
        expect(updated.value.lastUsedAt).toBeDefined();
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

      vi.mocked(mockGenerateAuthOpts).mockResolvedValue({ challenge: 'test' } as any);
      const optionsResult = await service.generateAuthenticationOptions(TEST_USER.id);
      const challenge = optionsResult._unsafeUnwrap().challenge;

      // Advance past expiry
      clock.advanceBy(6 * 60 * 1000);

      const result = await service.verifyAuthentication({
        challenge,
        response: { id: 'cred-1' } as any,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CHALLENGE_EXPIRED');
      }
    });

    it('rejects unknown credential', async () => {
      vi.mocked(mockGenerateAuthOpts).mockResolvedValue({ challenge: 'test' } as any);
      const optionsResult = await service.generateAuthenticationOptions();
      const challenge = optionsResult._unsafeUnwrap().challenge;

      const result = await service.verifyAuthentication({
        challenge,
        response: { id: 'unknown-cred' } as any,
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
});
