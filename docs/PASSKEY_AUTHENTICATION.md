# Passkey Authentication Plan

## Overview

This document outlines how to implement passkey (WebAuthn/FIDO2) authentication for Yoink's user-facing applications. Passkeys provide phishing-resistant, passwordless authentication using cryptographic key pairs.

## Background

### What Are Passkeys?

Passkeys use the WebAuthn standard (FIDO2) where:

- **Private key** stays on the user's device (never transmitted)
- **Public key** stored on the server
- **Authentication** = device signs a server challenge, server verifies the signature

Benefits:

- Phishing-resistant (credentials bound to origin)
- No passwords to leak or remember
- Cross-device sync via platform providers (iCloud Keychain, Google Password Manager)
- Hardware security key support

### Current Authentication Systems

Yoink currently has two separate auth mechanisms:

| System             | Purpose                                   | Mechanism                              |
| ------------------ | ----------------------------------------- | -------------------------------------- |
| **API Tokens**     | Machine-to-machine (CLI, Shortcuts, apps) | `tokenId:secret` with bcrypt hash      |
| **Admin Sessions** | Human admin via web UI                    | Password -> HMAC-signed cookie         |

**Recommendation**: Keep API tokens for M2M auth. Add passkeys for human authentication (admin panel, future end-user apps).

## Target Architecture

### Applications That Will Use Passkeys

1. **Admin Panel** - Single admin identity with multiple passkeys
2. **End-User Web App** (future) - Multi-user with passkey registration/login
3. **Browser Extension** (future) - Authenticate via passkey, receive API token

### Passkeys + API Tokens Flow

For browser extension and mobile apps, passkeys can be used to bootstrap API token creation:

```
+------------------------------------------------------------------+
|  Browser Extension / Mobile App                                   |
+------------------------------------------------------------------+
|  1. User authenticates with passkey                               |
|  2. Server verifies signature, creates session                    |
|  3. App requests API token for this device                        |
|  4. Server issues token (like admin panel does today)             |
|  5. App stores token, uses for subsequent API calls               |
+------------------------------------------------------------------+
```

This keeps the simple `Bearer token` pattern for API calls while using passkeys for the human authentication step.

## Technical Implementation

### Dependencies

```json
{
  "@simplewebauthn/server": "^11.0.0",
  "@simplewebauthn/browser": "^11.0.0"
}
```

### Data Model

#### Passkey Credential Schema

```typescript
import { z } from 'zod';

export const PasskeyCredentialSchema = z.object({
  id: z.string(), // Base64URL credential ID
  userId: z.string().uuid(), // User this credential belongs to
  publicKey: z.string(), // Base64URL encoded public key
  counter: z.number().int().nonnegative(), // Signature counter (replay protection)
  transports: z
    .array(z.enum(['usb', 'ble', 'nfc', 'internal', 'hybrid']))
    .optional(),
  deviceType: z.enum(['singleDevice', 'multiDevice']),
  backedUp: z.boolean(), // Synced to cloud provider
  name: z.string().optional(), // User-provided friendly name
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().optional(),
});

export type PasskeyCredential = z.infer<typeof PasskeyCredentialSchema>;
```

#### Database Schema (SQLite)

```sql
CREATE TABLE passkey_credentials (
  id TEXT PRIMARY KEY,                    -- Base64URL credential ID
  user_id TEXT NOT NULL,                  -- References users.id
  public_key TEXT NOT NULL,               -- Base64URL encoded
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,                        -- JSON array
  device_type TEXT NOT NULL,              -- 'singleDevice' | 'multiDevice'
  backed_up INTEGER NOT NULL DEFAULT 0,   -- boolean
  name TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_passkey_credentials_user_id ON passkey_credentials(user_id);
```

### WebAuthn Configuration

```typescript
type WebAuthnConfig = {
  rpId: string; // e.g., "yoink.app" or "localhost"
  rpName: string; // e.g., "Yoink"
  origin: string; // e.g., "https://yoink.app" or "http://localhost:3000"
};

// Environment-based configuration
const getWebAuthnConfig = (): WebAuthnConfig => ({
  rpId: process.env.WEBAUTHN_RP_ID ?? 'localhost',
  rpName: process.env.WEBAUTHN_RP_NAME ?? 'Yoink',
  origin: process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:3000',
});
```

### Store Interface

```typescript
import { Result } from 'neverthrow';

type PasskeyCredentialStore = {
  save(credential: PasskeyCredential): Promise<Result<void, StoreError>>;
  findById(
    credentialId: string
  ): Promise<Result<PasskeyCredential | null, StoreError>>;
  findByUserId(userId: string): Promise<Result<PasskeyCredential[], StoreError>>;
  updateCounter(
    credentialId: string,
    newCounter: number
  ): Promise<Result<void, StoreError>>;
  updateLastUsed(
    credentialId: string,
    timestamp: string
  ): Promise<Result<void, StoreError>>;
  delete(credentialId: string): Promise<Result<void, StoreError>>;
};
```

### Service Interface

```typescript
import { Result } from 'neverthrow';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';

type PasskeyServiceDependencies = {
  credentialStore: PasskeyCredentialStore;
  userStore: UserStore;
  config: WebAuthnConfig;
  clock: Clock;
};

type RegistrationChallenge = {
  challenge: string;
  userId: string;
  expiresAt: string;
};

type AuthenticationChallenge = {
  challenge: string;
  expiresAt: string;
};

type PasskeyService = {
  // Registration (attestation) ceremony
  generateRegistrationOptions(
    userId: string
  ): Promise<
    Result<
      {
        options: PublicKeyCredentialCreationOptionsJSON;
        challenge: RegistrationChallenge;
      },
      PasskeyError
    >
  >;

  verifyRegistration(params: {
    userId: string;
    challenge: string;
    response: RegistrationResponseJSON;
    credentialName?: string;
  }): Promise<Result<PasskeyCredential, PasskeyError>>;

  // Authentication (assertion) ceremony
  generateAuthenticationOptions(
    userId?: string
  ): Promise<
    Result<
      {
        options: PublicKeyCredentialRequestOptionsJSON;
        challenge: AuthenticationChallenge;
      },
      PasskeyError
    >
  >;

  verifyAuthentication(params: {
    challenge: string;
    response: AuthenticationResponseJSON;
  }): Promise<Result<{ userId: string; credentialId: string }, PasskeyError>>;
};
```

### Error Types

```typescript
type PasskeyError =
  | { type: 'USER_NOT_FOUND'; userId: string }
  | { type: 'CREDENTIAL_NOT_FOUND'; credentialId: string }
  | { type: 'CHALLENGE_EXPIRED' }
  | { type: 'CHALLENGE_MISMATCH' }
  | { type: 'VERIFICATION_FAILED'; reason: string }
  | { type: 'COUNTER_REPLAY'; expected: number; received: number }
  | { type: 'ORIGIN_MISMATCH'; expected: string; received: string }
  | { type: 'RP_ID_MISMATCH'; expected: string; received: string }
  | { type: 'STORE_ERROR'; cause: Error };
```

### Challenge Management

Challenges must be stored temporarily and validated to prevent replay attacks.

**Option A: Stateless challenges (HMAC-signed)**

```typescript
// Challenge = base64url({ userId, expiresAt }).signature
// Server verifies signature and expiry without database lookup
// Simpler, but can't invalidate challenges early
```

**Option B: Database-backed challenges**

```typescript
// Store challenges in database with TTL
// Can invalidate on use, track attempts
// More complex, but more control
```

**Recommendation**: Start with stateless (Option A) for simplicity. The challenge is short-lived (5 minutes) and single-use by design of WebAuthn.

## API Endpoints

### Registration Flow

```
POST /auth/passkey/register/options
  Request: { userId: string }
  Response: { options: PublicKeyCredentialCreationOptionsJSON }

POST /auth/passkey/register/verify
  Request: {
    userId: string,
    response: RegistrationResponseJSON,
    name?: string  // Friendly name like "MacBook Pro"
  }
  Response: { credential: { id, name, createdAt } }
```

### Authentication Flow

```
POST /auth/passkey/login/options
  Request: { userId?: string }  // Optional for discoverable credentials
  Response: { options: PublicKeyCredentialRequestOptionsJSON }

POST /auth/passkey/login/verify
  Request: { response: AuthenticationResponseJSON }
  Response: { sessionToken: string }
  Set-Cookie: session=...; HttpOnly; Secure; SameSite=Strict
```

### Credential Management

```
GET /auth/passkey/credentials
  Response: { credentials: [{ id, name, createdAt, lastUsedAt }] }

DELETE /auth/passkey/credentials/:id
  Response: 204 No Content
```

## Admin Panel Migration

### Phase 1: Add Passkeys Alongside Password

1. Keep existing password login working
2. Add passkey registration for admin
3. Add passkey login option
4. Both methods create the same session token

### Phase 2: Passkey-Only (Optional)

1. Remove password login endpoint
2. Remove `ADMIN_PASSWORD` env var
3. Require at least one passkey registered

### Admin-Specific Considerations

The admin panel currently has a single "admin" identity (not a user in the users table). Options:

**Option A: Virtual admin user**

- Create a special admin user record on first passkey registration
- Credentials reference this user ID
- Keeps admin separate from regular users

**Option B: Admin flag on users**

- Add `isAdmin` boolean to users table
- Admin passkeys are just credentials for users with admin flag
- Easier if admin needs org/user context

**Recommendation**: Option A for now (keeps admin isolated), evolve to Option B when building multi-user system.

## Browser Client Implementation

### Registration

```typescript
import { startRegistration } from '@simplewebauthn/browser';

const registerPasskey = async (userId: string, name?: string) => {
  // 1. Get options from server
  const optionsRes = await fetch('/auth/passkey/register/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  const { options } = await optionsRes.json();

  // 2. Create credential (browser prompts user)
  const credential = await startRegistration(options);

  // 3. Send to server for verification
  const verifyRes = await fetch('/auth/passkey/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, response: credential, name }),
  });

  return verifyRes.json();
};
```

### Authentication

```typescript
import { startAuthentication } from '@simplewebauthn/browser';

const loginWithPasskey = async () => {
  // 1. Get options from server
  const optionsRes = await fetch('/auth/passkey/login/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const { options } = await optionsRes.json();

  // 2. Authenticate (browser prompts user)
  const credential = await startAuthentication(options);

  // 3. Send to server for verification
  const verifyRes = await fetch('/auth/passkey/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: credential }),
  });

  // Session cookie is set automatically
  return verifyRes.json();
};
```

## Testing Strategy

### Unit Tests

- `PasskeyService` with mocked `@simplewebauthn/server` functions
- `PasskeyCredentialStore` contract tests (like existing store tests)
- Challenge generation and validation

### Integration Tests

For E2E tests that need to authenticate:

```typescript
// Test helper that bypasses WebAuthn ceremony
const loginAsAdmin = async (client: HttpClient) => {
  if (process.env.TEST_MODE === 'e2e') {
    // Use test bypass endpoint (only enabled in test mode)
    await client.post('/auth/test/create-session', { role: 'admin' });
  } else {
    // In-process tests can directly create session
    const session = adminSessionService.createSession({ isAdmin: true });
    client.setCookie('session', session);
  }
};
```

### WebAuthn Testing Libraries

For more realistic testing:

- `@simplewebauthn/server` provides test utilities
- Virtual authenticators in Playwright/Puppeteer
- Mocked credential responses for unit tests

## Security Considerations

1. **RP ID binding**: Credentials only work on the registered origin
2. **User verification**: Require UV for sensitive operations (biometric/PIN)
3. **Counter validation**: Detect cloned authenticators
4. **Backup eligibility**: Track if credential is synced (security vs convenience tradeoff)
5. **Attestation**: Consider requiring attestation for high-security scenarios

## Migration Path

### For Existing Web App Users (Token → Passkey)

Existing users authenticate via API token stored in localStorage. The migration path:

1. **Deploy passkey registration endpoints** (7.6a)
   - Combined auth middleware accepts both token and session cookie
   - `/api/auth/passkey/register/options` and `/verify` endpoints

2. **Deploy Settings UI** (7.7a)
   - "Add Passkey" in Settings → Security section
   - User registers passkey while still token-authenticated

3. **On passkey registration success**:
   - Server creates session and sets cookie
   - Web app clears localStorage token
   - User is now session-authenticated

4. **Deploy login pages** (7.6b + 7.7b)
   - New `/login` and `/signup` routes
   - Both token and session auth work during transition

5. **Remove token auth from web app** (7.7c)
   - Delete `/config` page and `tokenStorage` utility
   - Web app relies on session cookies only
   - API tokens remain valid for extension/CLI

**System Invariant**: Users must always have at least 1 passkey. Deletion of last passkey is prevented.

### For New Users (Invitation → Passkey)

New users go through the invitation-based signup flow:

1. Receive invitation code (created by admin or existing user)
2. Visit `/signup`, enter invitation code and email
3. Register passkey during signup
4. Session created automatically, user is authenticated

### For Admin Panel

The admin panel uses a separate authentication system (password-based admin sessions). Passkey support for admin is deferred. The admin panel is used for:

- Creating organizations and users
- Managing API tokens
- Creating invitations

### For Browser Extension (Future - 7.11)

The extension currently uses API tokens configured manually. Future enhancement:

1. User authenticates with passkey in extension popup
2. Extension requests scoped API token from server
3. Token stored in extension storage for subsequent requests

This keeps the simple Bearer token pattern for API calls while using passkeys for the human authentication step.

## References

- [WebAuthn Specification](https://www.w3.org/TR/webauthn-3/)
- [SimpleWebAuthn Documentation](https://simplewebauthn.dev/)
- [Passkeys.dev](https://passkeys.dev/) - Implementation guides
- [FIDO Alliance](https://fidoalliance.org/fido2/) - Standards body
