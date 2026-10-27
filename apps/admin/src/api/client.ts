import { initTsrReactQuery } from '@ts-rest/react-query/v5';
import {
  adminPublicContract,
  adminProtectedContract,
} from '@yoink/api-contracts';

// No Content-Type base header. ts-rest adds application/json only when a
// body is present. A bodyless request is valid with or without that header.
const commonOptions = {
  baseUrl: '',
  credentials: 'include' as const,
};

/**
 * ts-rest React Query client for public admin endpoints (login, logout).
 * These don't require session authentication.
 */
export const tsrPublic = initTsrReactQuery(adminPublicContract, commonOptions);

/**
 * ts-rest React Query client for protected admin endpoints.
 * Requires session cookie authentication.
 */
export const tsrAdmin = initTsrReactQuery(adminProtectedContract, commonOptions);
