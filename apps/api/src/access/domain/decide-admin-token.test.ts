import { describe, expect, it } from 'vitest';
import { decideAdminToken, decideRevokeAdminToken } from './decide-admin-token.js';

describe('decideAdminToken', () => {
  it('trims the name and keeps the hash, not the raw secret', () => {
    const plan = decideAdminToken({
      command: {
        organizationId: '550e8400-e29b-41d4-a716-446655440001',
        userId: '550e8400-e29b-41d4-a716-446655440010',
        name: '  Lane  ',
      },
      tokenId: '550e8400-e29b-41d4-a716-446655440020',
      tokenHash: 'hashed-secret',
      now: '2024-06-15T12:00:00.000Z',
    });

    expect(plan.token.name).toBe('Lane');
    expect(plan.token.tokenHash).toBe('hashed-secret');
    expect(plan.token).not.toHaveProperty('rawToken');
    expect(JSON.stringify(plan)).not.toContain('raw-secret');
  });

  it('plans a revoke at the given time', () => {
    expect(
      decideRevokeAdminToken({
        tokenId: '550e8400-e29b-41d4-a716-446655440020',
        revokedAt: '2024-06-15T12:00:00.000Z',
      })
    ).toEqual({
      kind: 'revoke-admin-token',
      tokenId: '550e8400-e29b-41d4-a716-446655440020',
      revokedAt: '2024-06-15T12:00:00.000Z',
    });
  });
});
