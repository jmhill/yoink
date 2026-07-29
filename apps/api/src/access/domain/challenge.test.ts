import { describe, it, expect } from 'vitest';
import { createFakeClock } from '@yoink/infrastructure';
import { createChallengeManager } from './challenge.js';

const TEST_SECRET = 'test-secret-that-is-at-least-32-bytes-long-for-hmac';

describe('createChallengeManager', () => {
  describe('generateRegistrationChallenge', () => {
    it('generates a base64url-encoded challenge', () => {
      const clock = createFakeClock(new Date('2024-01-01T00:00:00.000Z'));
      const manager = createChallengeManager({ secret: TEST_SECRET, clock });
      
      const challenge = manager.generateRegistrationChallenge('user-123');
      
      expect(challenge).toBeDefined();
      expect(typeof challenge).toBe('string');
      // Base64URL should not contain + / = characters
      expect(challenge).not.toMatch(/[+/=]/);
    });
    
    it('generates unique challenges each time', () => {
      const clock = createFakeClock(new Date('2024-01-01T00:00:00.000Z'));
      const manager = createChallengeManager({ secret: TEST_SECRET, clock });
      
      const challenge1 = manager.generateRegistrationChallenge('user-123');
      const challenge2 = manager.generateRegistrationChallenge('user-123');
      
      expect(challenge1).not.toBe(challenge2);
    });
  });
  
  describe('generateAuthenticationChallenge', () => {
    it('generates a challenge without userId', () => {
      const clock = createFakeClock(new Date('2024-01-01T00:00:00.000Z'));
      const manager = createChallengeManager({ secret: TEST_SECRET, clock });
      
      const challenge = manager.generateAuthenticationChallenge();
      
      expect(challenge).toBeDefined();
    });
    
    it('generates a challenge with userId', () => {
      const clock = createFakeClock(new Date('2024-01-01T00:00:00.000Z'));
      const manager = createChallengeManager({ secret: TEST_SECRET, clock });
      
      const challenge = manager.generateAuthenticationChallenge('user-123');
      
      expect(challenge).toBeDefined();
    });
  });
  
  describe('validateChallenge', () => {
    it('validates a registration challenge', () => {
      const clock = createFakeClock(new Date('2024-01-01T00:00:00.000Z'));
      const manager = createChallengeManager({ secret: TEST_SECRET, clock });
      
      const challenge = manager.generateRegistrationChallenge('user-123');
      const result = manager.validateChallenge(challenge, 'registration');
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.payload.purpose).toBe('registration');
        expect(result.value.payload.userId).toBe('user-123');
        expect(result.value.rawChallenge).toBeInstanceOf(Buffer);
      }
    });
    
    it('validates an authentication challenge', () => {
      const clock = createFakeClock(new Date('2024-01-01T00:00:00.000Z'));
      const manager = createChallengeManager({ secret: TEST_SECRET, clock });
      
      const challenge = manager.generateAuthenticationChallenge('user-456');
      const result = manager.validateChallenge(challenge, 'authentication');
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.payload.purpose).toBe('authentication');
        expect(result.value.payload.userId).toBe('user-456');
      }
    });
    
    it('rejects expired challenge', () => {
      const clock = createFakeClock(new Date('2024-01-01T00:00:00.000Z'));
      const manager = createChallengeManager({ secret: TEST_SECRET, clock });
      
      const challenge = manager.generateRegistrationChallenge('user-123');
      
      // Advance clock past expiry (5 minutes + 1 second)
      clock.advanceBy(5 * 60 * 1000 + 1000);
      
      const result = manager.validateChallenge(challenge, 'registration');
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CHALLENGE_EXPIRED');
      }
    });
    
    it('rejects challenge with wrong purpose', () => {
      const clock = createFakeClock(new Date('2024-01-01T00:00:00.000Z'));
      const manager = createChallengeManager({ secret: TEST_SECRET, clock });
      
      const challenge = manager.generateRegistrationChallenge('user-123');
      const result = manager.validateChallenge(challenge, 'authentication');
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CHALLENGE_INVALID');
      }
    });
    
    it('rejects tampered challenge', () => {
      const clock = createFakeClock(new Date('2024-01-01T00:00:00.000Z'));
      const manager = createChallengeManager({ secret: TEST_SECRET, clock });
      
      const challenge = manager.generateRegistrationChallenge('user-123');
      
      // Tamper with a character in the middle by replacing it with a different character
      const charAtPosition = challenge.charAt(20);
      const replacementChar = charAtPosition === 'X' ? 'Y' : 'X';
      const tamperedChallenge = challenge.slice(0, 20) + replacementChar + challenge.slice(21);
      
      const result = manager.validateChallenge(tamperedChallenge, 'registration');
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(['CHALLENGE_TAMPERED', 'CHALLENGE_INVALID']).toContain(result.error.type);
      }
    });
    
    it('rejects challenge signed with different secret', () => {
      const clock = createFakeClock(new Date('2024-01-01T00:00:00.000Z'));
      const manager1 = createChallengeManager({ secret: TEST_SECRET, clock });
      const manager2 = createChallengeManager({ secret: 'different-secret-that-is-at-least-32-bytes', clock });
      
      const challenge = manager1.generateRegistrationChallenge('user-123');
      const result = manager2.validateChallenge(challenge, 'registration');
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CHALLENGE_TAMPERED');
      }
    });
    
    it('rejects invalid base64', () => {
      const clock = createFakeClock(new Date('2024-01-01T00:00:00.000Z'));
      const manager = createChallengeManager({ secret: TEST_SECRET, clock });
      
      const result = manager.validateChallenge('not-valid!!!', 'registration');
      
      expect(result.isErr()).toBe(true);
    });
    
    it('rejects too-short challenge', () => {
      const clock = createFakeClock(new Date('2024-01-01T00:00:00.000Z'));
      const manager = createChallengeManager({ secret: TEST_SECRET, clock });
      
      const result = manager.validateChallenge('c2hvcnQ', 'registration');
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('CHALLENGE_INVALID');
      }
    });
    
    it('accepts challenge just before expiry', () => {
      const clock = createFakeClock(new Date('2024-01-01T00:00:00.000Z'));
      const manager = createChallengeManager({ secret: TEST_SECRET, clock });
      
      const challenge = manager.generateRegistrationChallenge('user-123');
      
      // Advance clock to just before expiry (5 minutes - 1 second)
      clock.advanceBy(5 * 60 * 1000 - 1000);
      
      const result = manager.validateChallenge(challenge, 'registration');
      
      expect(result.isOk()).toBe(true);
    });
  });
});
