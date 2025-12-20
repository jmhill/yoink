import { initClient } from '@ts-rest/core';
import { captureContract } from '@yoink/api-contracts';
import { tokenStorage } from '@/lib/token';

// Base URL is empty since we're on the same origin (or proxied in dev)
const baseUrl = '';

/**
 * Client for capture endpoints (requires API token from localStorage)
 */
export const captureApi = initClient(captureContract, {
  baseUrl,
  baseHeaders: {
    'Content-Type': 'application/json',
  },
  api: async (args) => {
    const token = tokenStorage.get();
    const headers = new Headers(args.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    
    const response = await fetch(args.path, {
      method: args.method,
      headers,
      body: args.body,
    });
    
    return {
      status: response.status,
      body: await response.json(),
      headers: response.headers,
    };
  },
});
