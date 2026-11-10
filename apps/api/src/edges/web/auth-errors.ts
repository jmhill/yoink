import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { PasskeyServiceError } from '../../access/domain/auth-errors.js';
import { accessHttpError, accessStorageError } from '../_shared/auth/access-http-errors.js';

export const isAuthenticationResponse = (value: unknown): value is AuthenticationResponseJSON =>
  typeof value === 'object' && value !== null;

export const isRegistrationResponse = (value: unknown): value is RegistrationResponseJSON =>
  typeof value === 'object' && value !== null;

/** Copied from the legacy auth registrar so this edge does not import it. */
export const authenticationOptionsFailure = (error: PasskeyServiceError) => {
  switch (error.type) {
    case 'USER_NOT_FOUND':
    case 'CREDENTIAL_NOT_FOUND':
    case 'CHALLENGE_EXPIRED':
    case 'CHALLENGE_MISMATCH':
    case 'VERIFICATION_FAILED':
    case 'COUNTER_REPLAY':
    case 'ORIGIN_MISMATCH':
    case 'RP_ID_MISMATCH':
    case 'CANNOT_DELETE_LAST_PASSKEY':
    case 'CREDENTIAL_OWNERSHIP_ERROR':
    case 'AGENT_CANNOT_USE_PASSKEY':
    case 'PASSKEY_CREDENTIAL_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to generate authentication options');
    default: {
      const _never: never = error;
      return accessStorageError(_never, 'Failed to generate authentication options');
    }
  }
};

/** Copied from the legacy auth registrar so this edge does not import it. */
export const loginVerifyFailure = (error: PasskeyServiceError) => {
  switch (error.type) {
    case 'CHALLENGE_EXPIRED':
      return accessHttpError({ code: 'GONE', message: 'Challenge has expired' });
    case 'CREDENTIAL_NOT_FOUND':
      return accessHttpError({ code: 'UNAUTHORIZED', message: 'Passkey not recognized' });
    case 'VERIFICATION_FAILED':
      return accessHttpError({ code: 'BAD_REQUEST', message: error.reason });
    case 'USER_NOT_FOUND':
    case 'CHALLENGE_MISMATCH':
    case 'COUNTER_REPLAY':
    case 'ORIGIN_MISMATCH':
    case 'RP_ID_MISMATCH':
    case 'CANNOT_DELETE_LAST_PASSKEY':
    case 'CREDENTIAL_OWNERSHIP_ERROR':
    case 'AGENT_CANNOT_USE_PASSKEY':
    case 'PASSKEY_CREDENTIAL_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return accessHttpError({ code: 'BAD_REQUEST', message: 'Authentication failed' });
    default: {
      const _never: never = error;
      return accessHttpError({
        code: 'BAD_REQUEST',
        message: 'Authentication failed',
        cause: _never,
      });
    }
  }
};

/** Copied from the legacy passkey registrar so this edge does not import it. */
export const registrationOptionsFailure = (error: PasskeyServiceError) => {
  switch (error.type) {
    case 'AGENT_CANNOT_USE_PASSKEY':
      return accessHttpError({ code: 'FORBIDDEN', message: 'Agents cannot register passkeys' });
    case 'USER_NOT_FOUND':
    case 'CREDENTIAL_NOT_FOUND':
    case 'CHALLENGE_EXPIRED':
    case 'CHALLENGE_MISMATCH':
    case 'VERIFICATION_FAILED':
    case 'COUNTER_REPLAY':
    case 'ORIGIN_MISMATCH':
    case 'RP_ID_MISMATCH':
    case 'CANNOT_DELETE_LAST_PASSKEY':
    case 'CREDENTIAL_OWNERSHIP_ERROR':
    case 'PASSKEY_CREDENTIAL_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to generate registration options');
    default: {
      const _never: never = error;
      return accessStorageError(_never, 'Failed to generate registration options');
    }
  }
};

/** Copied from the legacy passkey registrar so this edge does not import it. */
export const registrationVerifyFailure = (error: PasskeyServiceError) => {
  switch (error.type) {
    case 'CHALLENGE_EXPIRED':
      return accessHttpError({ code: 'GONE', message: 'Challenge has expired' });
    case 'VERIFICATION_FAILED':
      return accessHttpError({ code: 'BAD_REQUEST', message: error.reason });
    case 'USER_NOT_FOUND':
    case 'CREDENTIAL_NOT_FOUND':
    case 'CHALLENGE_MISMATCH':
    case 'COUNTER_REPLAY':
    case 'ORIGIN_MISMATCH':
    case 'RP_ID_MISMATCH':
    case 'CANNOT_DELETE_LAST_PASSKEY':
    case 'CREDENTIAL_OWNERSHIP_ERROR':
    case 'AGENT_CANNOT_USE_PASSKEY':
    case 'PASSKEY_CREDENTIAL_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, 'Passkey registration failed', 'Passkey verification failed');
    default: {
      const _never: never = error;
      return accessStorageError(
        _never,
        'Passkey registration failed',
        'Passkey verification failed'
      );
    }
  }
};

/** Copied from the legacy passkey registrar so this edge does not import it. */
export const deleteCredentialFailure = (error: PasskeyServiceError) => {
  switch (error.type) {
    case 'CREDENTIAL_NOT_FOUND':
      return accessHttpError({ code: 'NOT_FOUND', message: 'Passkey not found' });
    case 'CREDENTIAL_OWNERSHIP_ERROR':
      return accessHttpError({ code: 'FORBIDDEN', message: 'You do not own this passkey' });
    case 'CANNOT_DELETE_LAST_PASSKEY':
      return accessHttpError({ code: 'CONFLICT', message: 'Cannot delete your last passkey' });
    case 'USER_NOT_FOUND':
    case 'CHALLENGE_EXPIRED':
    case 'CHALLENGE_MISMATCH':
    case 'VERIFICATION_FAILED':
    case 'COUNTER_REPLAY':
    case 'ORIGIN_MISMATCH':
    case 'RP_ID_MISMATCH':
    case 'AGENT_CANNOT_USE_PASSKEY':
    case 'PASSKEY_CREDENTIAL_STORAGE_ERROR':
    case 'USER_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to delete passkey', 'Failed to delete credential');
    default: {
      const _never: never = error;
      return accessStorageError(_never, 'Failed to delete passkey', 'Failed to delete credential');
    }
  }
};
