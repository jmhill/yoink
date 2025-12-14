import { initClient } from '@ts-rest/core';
import {
  adminPublicContract,
  adminProtectedContract,
} from '@yoink/api-contracts';

// Base URL is empty since we're on the same origin (or proxied in dev)
const baseUrl = '';

const commonOptions = {
  baseUrl,
  credentials: 'include' as const, // Send cookies with requests
  baseHeaders: {
    'Content-Type': 'application/json',
  },
};

/**
 * Client for public admin endpoints (login, logout)
 */
export const publicApi = initClient(adminPublicContract, commonOptions);

/**
 * Client for protected admin endpoints (requires session cookie)
 */
export const adminApi = initClient(adminProtectedContract, commonOptions);
