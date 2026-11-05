import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import {
  SignupOptionsRequestSchema,
  SignupOptionsResponseSchema,
  SignupVerifyRequestSchema,
  SignupVerifyResponseSchema,
} from '../schemas/signup.js';

export const signupOrpcContract = oc.router({
  options: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/auth/signup/options',
        summary: 'Get WebAuthn registration options for signup',
      })
    )
    .input(SignupOptionsRequestSchema)
    .output(SignupOptionsResponseSchema),
  verify: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/auth/signup/verify',
        successStatus: 201,
        summary: 'Complete signup with WebAuthn registration',
      })
    )
    .input(SignupVerifyRequestSchema)
    .output(SignupVerifyResponseSchema),
});
