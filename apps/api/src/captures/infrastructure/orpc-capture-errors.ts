import { ORPCError } from '@orpc/server';
import type { PrincipalKind } from '../../shared/auth-context.js';
import type { CreateCaptureError, ListCapturesError } from '../domain/capture-errors.js';

export const mapAgentCaptureRefusal = (principalKind: PrincipalKind) => {
  switch (principalKind) {
    case 'agent':
      return new ORPCError('FORBIDDEN', {
        message: 'Agents cannot create captures',
      });
    case 'human':
      return undefined;
    default: {
      const _never: never = principalKind;
      void _never;
      return undefined;
    }
  }
};

export const mapCreateCaptureError = (error: CreateCaptureError) => {
  switch (error.type) {
    case 'STORAGE_ERROR':
      return new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to create capture',
        cause: error,
      });
  }
};

export const mapListCapturesError = (error: ListCapturesError) => {
  switch (error.type) {
    case 'INVALID_CURSOR':
      return new ORPCError('INVALID_CURSOR', {
        message: error.message,
        cause: error,
      });
    case 'STORAGE_ERROR':
      return new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to list captures',
        cause: error,
      });
    default: {
      const _never: never = error;
      return new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to list captures',
        cause: _never,
      });
    }
  }
};
