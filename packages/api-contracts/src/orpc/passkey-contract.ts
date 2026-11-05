import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import {
  PasskeyCredentialsListResponseSchema,
  PasskeyDeleteResponseSchema,
  PasskeyRegisterOptionsResponseSchema,
  PasskeyRegisterVerifyRequestSchema,
  PasskeyRegisterVerifyResponseSchema,
} from '../schemas/passkey.js';

const credentialId = z.object({
  credentialId: z.string(),
});

export const passkeyOrpcContract = oc.router({
  registerOptions: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/auth/passkey/register/options',
        summary: 'Get WebAuthn registration options for adding a passkey',
      })
    )
    .input(z.object({}))
    .output(PasskeyRegisterOptionsResponseSchema),
  registerVerify: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/auth/passkey/register/verify',
        successStatus: 201,
        summary: 'Complete passkey registration with WebAuthn response',
      })
    )
    .input(PasskeyRegisterVerifyRequestSchema)
    .output(PasskeyRegisterVerifyResponseSchema),
  listCredentials: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/auth/passkey/credentials',
        summary: 'List passkey credentials for the current user',
      })
    )
    .output(PasskeyCredentialsListResponseSchema),
  deleteCredential: oc
    .meta(
      openapi({
        method: 'DELETE',
        path: '/api/auth/passkey/credentials/{credentialId}',
        summary: 'Delete a passkey credential',
      })
    )
    .input(credentialId)
    .output(PasskeyDeleteResponseSchema),
});
