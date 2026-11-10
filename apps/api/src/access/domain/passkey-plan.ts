import type { PasskeyCredential } from './passkey-credential.js';
import type { VerifiedPasskeyMaterial } from './webauthn-verifier.js';

/**
 * One passkey write this service owns. The access participant compiles it.
 * The unit of work does not inspect it. `kind` keeps these plans distinct
 * from signup's credential insert. Signup still writes its credential
 * inside the signup plan. `planRegistrationCredential` does not build one
 * of these for that path.
 */
export type SavePasskeyPlan = {
  readonly kind: 'save-passkey';
  readonly credential: PasskeyCredential;
};

export type RecordPasskeyUsePlan = {
  readonly kind: 'record-passkey-use';
  readonly credentialId: string;
  readonly counter: number;
  readonly lastUsedAt: string;
};

export type DeletePasskeyPlan = {
  readonly kind: 'delete-passkey';
  readonly credentialId: string;
};

export type PasskeyPlan = SavePasskeyPlan | RecordPasskeyUsePlan | DeletePasskeyPlan;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasString = (value: unknown, key: string): boolean =>
  isRecord(value) && typeof value[key] === 'string';

const hasNumber = (value: unknown, key: string): boolean =>
  isRecord(value) && typeof value[key] === 'number';

export const isPasskeyPlan = (plan: unknown): plan is PasskeyPlan => {
  if (!isRecord(plan)) {
    return false;
  }
  if (plan.kind === 'save-passkey') {
    return (
      hasString(plan.credential, 'id') &&
      hasString(plan.credential, 'userId') &&
      hasString(plan.credential, 'publicKey') &&
      hasString(plan.credential, 'createdAt') &&
      hasNumber(plan.credential, 'counter')
    );
  }
  if (plan.kind === 'record-passkey-use') {
    return (
      typeof plan.credentialId === 'string' &&
      typeof plan.counter === 'number' &&
      typeof plan.lastUsedAt === 'string'
    );
  }
  if (plan.kind === 'delete-passkey') {
    return typeof plan.credentialId === 'string';
  }
  return false;
};

/**
 * The verified material, the user, and the clock become the credential.
 * `lastUsedAt` stays unset. This is the credential store's insert, not
 * signup's conditional insert.
 */
export const planSavePasskey = (input: {
  readonly userId: string;
  readonly credentialName?: string;
  readonly now: string;
  readonly material: VerifiedPasskeyMaterial;
}): SavePasskeyPlan => ({
  kind: 'save-passkey',
  credential: {
    id: input.material.id,
    userId: input.userId,
    publicKey: input.material.publicKey,
    counter: input.material.counter,
    transports:
      input.material.transports === undefined ? undefined : [...input.material.transports],
    deviceType: input.material.deviceType,
    backedUp: input.material.backedUp,
    name: input.credentialName,
    createdAt: input.now,
    lastUsedAt: undefined,
  },
});

/**
 * Counter and last-used are one write. The compile emits both updates.
 */
export const planRecordPasskeyUse = (input: {
  readonly credentialId: string;
  readonly newCounter: number;
  readonly lastUsedAt: string;
}): RecordPasskeyUsePlan => ({
  kind: 'record-passkey-use',
  credentialId: input.credentialId,
  counter: input.newCounter,
  lastUsedAt: input.lastUsedAt,
});

export const planDeletePasskey = (credentialId: string): DeletePasskeyPlan => ({
  kind: 'delete-passkey',
  credentialId,
});
