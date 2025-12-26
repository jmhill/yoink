import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ok, err, type Result } from 'neverthrow';
import type { Clock } from '@yoink/infrastructure';

/**
 * Challenge payload embedded in the challenge string.
 */
export type ChallengePayload = {
  /** Purpose of the challenge: registration or authentication */
  purpose: 'registration' | 'authentication';
  /** User ID for registration, optional for authentication (discoverable credentials) */
  userId?: string;
  /** ISO timestamp when the challenge expires */
  expiresAt: string;
};

/**
 * Parsed and validated challenge.
 */
export type ValidatedChallenge = {
  payload: ChallengePayload;
  /** Raw challenge bytes (for WebAuthn verification) */
  rawChallenge: Buffer;
};

export type ChallengeError =
  | { type: 'CHALLENGE_EXPIRED' }
  | { type: 'CHALLENGE_INVALID' }
  | { type: 'CHALLENGE_TAMPERED' };

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Creates a stateless challenge manager using HMAC for integrity.
 * 
 * Challenge format: base64url(randomBytes(32) + payload + signature)
 * - 32 random bytes for uniqueness
 * - JSON-encoded payload with purpose, userId, expiresAt
 * - HMAC-SHA256 signature of the above
 */
export type ChallengeManager = {
  /** Generate a new challenge for registration */
  generateRegistrationChallenge(userId: string): string;
  
  /** Generate a new challenge for authentication */
  generateAuthenticationChallenge(userId?: string): string;
  
  /** Validate and parse a challenge, checking signature and expiry */
  validateChallenge(
    challenge: string,
    expectedPurpose: 'registration' | 'authentication'
  ): Result<ValidatedChallenge, ChallengeError>;
};

export type ChallengeManagerDependencies = {
  secret: string;
  clock: Clock;
};

/**
 * Base64URL encode a buffer.
 */
const base64UrlEncode = (buffer: Buffer): string => {
  return buffer.toString('base64url');
};

/**
 * Base64URL decode a string to buffer.
 */
const base64UrlDecode = (str: string): Buffer => {
  return Buffer.from(str, 'base64url');
};

export const createChallengeManager = (
  deps: ChallengeManagerDependencies
): ChallengeManager => {
  const { secret, clock } = deps;
  
  const sign = (data: Buffer): Buffer => {
    const hmac = createHmac('sha256', secret);
    hmac.update(data);
    return hmac.digest();
  };
  
  const generateChallenge = (payload: ChallengePayload): string => {
    // Generate random bytes for uniqueness
    const randomPart = randomBytes(32);
    
    // Encode payload as JSON
    const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
    
    // Concatenate random + payload
    const dataToSign = Buffer.concat([randomPart, payloadBytes]);
    
    // Sign the data
    const signature = sign(dataToSign);
    
    // Final challenge: random + payload length (4 bytes) + payload + signature
    const payloadLength = Buffer.alloc(4);
    payloadLength.writeUInt32BE(payloadBytes.length);
    
    const fullChallenge = Buffer.concat([randomPart, payloadLength, payloadBytes, signature]);
    
    return base64UrlEncode(fullChallenge);
  };
  
  return {
    generateRegistrationChallenge: (userId: string): string => {
      const expiresAt = new Date(clock.now().getTime() + CHALLENGE_TTL_MS).toISOString();
      return generateChallenge({ purpose: 'registration', userId, expiresAt });
    },
    
    generateAuthenticationChallenge: (userId?: string): string => {
      const expiresAt = new Date(clock.now().getTime() + CHALLENGE_TTL_MS).toISOString();
      return generateChallenge({ purpose: 'authentication', userId, expiresAt });
    },
    
    validateChallenge: (
      challenge: string,
      expectedPurpose: 'registration' | 'authentication'
    ): Result<ValidatedChallenge, ChallengeError> => {
      try {
        const challengeBytes = base64UrlDecode(challenge);
        
        // Minimum length: 32 (random) + 4 (length) + 1 (min payload) + 32 (signature)
        if (challengeBytes.length < 69) {
          return err({ type: 'CHALLENGE_INVALID' });
        }
        
        // Extract parts
        const randomPart = challengeBytes.subarray(0, 32);
        const payloadLength = challengeBytes.readUInt32BE(32);
        
        // Validate payload length is reasonable
        if (payloadLength > challengeBytes.length - 68) {
          return err({ type: 'CHALLENGE_INVALID' });
        }
        
        const payloadBytes = challengeBytes.subarray(36, 36 + payloadLength);
        const providedSignature = challengeBytes.subarray(36 + payloadLength);
        
        // Verify signature length
        if (providedSignature.length !== 32) {
          return err({ type: 'CHALLENGE_INVALID' });
        }
        
        // Verify signature (data to sign = random + payload)
        const dataToSign = Buffer.concat([randomPart, payloadBytes]);
        const expectedSignature = sign(dataToSign);
        
        if (!timingSafeEqual(providedSignature, expectedSignature)) {
          return err({ type: 'CHALLENGE_TAMPERED' });
        }
        
        // Parse payload
        let payload: ChallengePayload;
        try {
          payload = JSON.parse(payloadBytes.toString('utf8')) as ChallengePayload;
        } catch {
          return err({ type: 'CHALLENGE_INVALID' });
        }
        
        // Validate purpose
        if (payload.purpose !== expectedPurpose) {
          return err({ type: 'CHALLENGE_INVALID' });
        }
        
        // Check expiry
        const expiresAt = new Date(payload.expiresAt);
        if (clock.now() > expiresAt) {
          return err({ type: 'CHALLENGE_EXPIRED' });
        }
        
        return ok({
          payload,
          rawChallenge: challengeBytes,
        });
      } catch {
        return err({ type: 'CHALLENGE_INVALID' });
      }
    },
  };
};
