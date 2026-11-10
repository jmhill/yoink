import { ProcedureContract } from '@orpc/contract';
import { getOpenAPIMeta } from '@orpc/openapi';
import { describe, expect, it } from 'vitest';
import { webAuthContract } from './auth-contract.js';
import { webInboxContract } from './contract.js';
import { webListsContract } from './lists-contract.js';
import { webSettingsContract } from './settings-contract.js';
import { webTasksContract } from './tasks-contract.js';

const procedures = (
  router: unknown,
  key: string[] = []
): { key: string; method: string; path: string }[] => {
  if (router instanceof ProcedureContract) {
    const meta = getOpenAPIMeta(router);
    return [{ key: key.join('.'), method: meta?.method ?? '', path: meta?.path ?? '' }];
  }
  if (typeof router !== 'object' || router === null) return [];
  return Object.entries(router).flatMap(([name, value]) => procedures(value, [...key, name]));
};

describe('web inbox contract', () => {
  it('is inbox create and list, on the resource path', () => {
    const listed = procedures(webInboxContract);
    expect(listed).toEqual([
      { key: 'create', method: 'POST', path: '/inbox' },
      { key: 'list', method: 'GET', path: '/inbox' },
    ]);
    expect(listed.some((procedure) => procedure.path.includes('web-api'))).toBe(false);
  });
});

describe('web settings contract', () => {
  it('is settings and organizations, on the resource path', () => {
    const listed = procedures(webSettingsContract);
    expect(listed).toEqual([
      { key: 'switchOrganization', method: 'POST', path: '/organizations/switch' },
      { key: 'leave', method: 'POST', path: '/organizations/{organizationId}/leave' },
      {
        key: 'transferOwner',
        method: 'POST',
        path: '/organizations/{organizationId}/owner/transfer',
      },
      { key: 'listMembers', method: 'GET', path: '/organizations/{organizationId}/members' },
      {
        key: 'changeMemberRole',
        method: 'PATCH',
        path: '/organizations/{organizationId}/members/{userId}/role',
      },
      {
        key: 'removeMember',
        method: 'DELETE',
        path: '/organizations/{organizationId}/members/{userId}',
      },
      { key: 'createAgent', method: 'POST', path: '/organizations/{organizationId}/agents' },
      {
        key: 'reissueAgentToken',
        method: 'POST',
        path: '/organizations/{organizationId}/members/{userId}/token',
      },
      { key: 'createInvitation', method: 'POST', path: '/invitations' },
      {
        key: 'listPendingInvitations',
        method: 'GET',
        path: '/organizations/{organizationId}/invitations',
      },
      { key: 'revokeInvitation', method: 'DELETE', path: '/invitations/{invitationId}' },
      { key: 'listTokens', method: 'GET', path: '/auth/tokens' },
      { key: 'createToken', method: 'POST', path: '/auth/tokens' },
      { key: 'deleteToken', method: 'DELETE', path: '/auth/tokens/{tokenId}' },
    ]);
    expect(listed.some((procedure) => procedure.path.includes('passkey'))).toBe(false);
    expect(listed.some((procedure) => procedure.path.includes('web-api'))).toBe(false);
  });
});

describe('web auth contract', () => {
  it('is login, signup, session, passkeys, and join, on the resource path', () => {
    const listed = procedures(webAuthContract);
    expect(listed).toEqual([
      { key: 'loginOptions', method: 'POST', path: '/auth/login/options' },
      { key: 'loginVerify', method: 'POST', path: '/auth/login/verify' },
      { key: 'logout', method: 'POST', path: '/auth/logout' },
      { key: 'session', method: 'GET', path: '/auth/session' },
      { key: 'signupOptions', method: 'POST', path: '/auth/signup/options' },
      { key: 'signupVerify', method: 'POST', path: '/auth/signup/verify' },
      { key: 'validateInvitation', method: 'POST', path: '/invitations/validate' },
      { key: 'acceptInvitation', method: 'POST', path: '/invitations/accept' },
      { key: 'registerPasskeyOptions', method: 'POST', path: '/auth/passkey/register/options' },
      { key: 'registerPasskey', method: 'POST', path: '/auth/passkey/register/verify' },
      { key: 'listPasskeys', method: 'GET', path: '/auth/passkey/credentials' },
      { key: 'deletePasskey', method: 'DELETE', path: '/auth/passkey/credentials/{credentialId}' },
    ]);
    expect(listed.some((procedure) => procedure.path.includes('/auth/tokens'))).toBe(false);
    expect(listed.some((procedure) => procedure.path.includes('web-api'))).toBe(false);
    expect(listed.some((procedure) => procedure.path.startsWith('/api'))).toBe(false);
  });
});

describe('web lists contract', () => {
  it('is named lists and open-task order, on the resource path', () => {
    const listed = procedures(webListsContract);
    expect(listed).toEqual([
      { key: 'list', method: 'GET', path: '/lists' },
      { key: 'create', method: 'POST', path: '/lists' },
      { key: 'rename', method: 'PATCH', path: '/lists/{id}' },
      { key: 'delete', method: 'DELETE', path: '/lists/{id}' },
      { key: 'listOpenTasks', method: 'GET', path: '/lists/{id}/tasks' },
      { key: 'reorderOpenTasks', method: 'PUT', path: '/lists/{id}/tasks/order' },
      { key: 'listUnlistedOpenTasks', method: 'GET', path: '/unlisted/tasks' },
      { key: 'reorderUnlistedOpenTasks', method: 'PUT', path: '/unlisted/tasks/order' },
    ]);
    expect(listed.some((procedure) => procedure.path.includes('web-api'))).toBe(false);
    expect(listed.some((procedure) => procedure.path.startsWith('/api'))).toBe(false);
  });
});

describe('web tasks contract', () => {
  it('is the task board, without get, pin, or history', () => {
    const listed = procedures(webTasksContract);
    expect(listed).toEqual([
      { key: 'create', method: 'POST', path: '/tasks' },
      { key: 'list', method: 'GET', path: '/tasks' },
      { key: 'update', method: 'PATCH', path: '/tasks/{id}' },
      { key: 'complete', method: 'POST', path: '/tasks/{id}/complete' },
      { key: 'uncomplete', method: 'POST', path: '/tasks/{id}/uncomplete' },
      { key: 'delete', method: 'DELETE', path: '/tasks/{id}' },
    ]);
    expect(listed.some((procedure) => procedure.path.includes('history'))).toBe(false);
    expect(listed.some((procedure) => procedure.path.includes('pin'))).toBe(false);
    expect(listed.some((procedure) => procedure.path.includes('web-api'))).toBe(false);
    expect(listed.some((procedure) => procedure.path.startsWith('/api'))).toBe(false);
  });
});
