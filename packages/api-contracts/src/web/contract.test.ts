import { ProcedureContract } from '@orpc/contract';
import { getOpenAPIMeta } from '@orpc/openapi';
import { describe, expect, it } from 'vitest';
import { webInboxContract } from './contract.js';
import { webSettingsContract } from './settings-contract.js';

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
