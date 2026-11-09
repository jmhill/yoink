import { describe, expect, it } from 'vitest';
import { decideCreateOrganization } from './decide-create-organization.js';

describe('decideCreateOrganization', () => {
  it('builds a workspace plan from the name, id, and time', () => {
    const plan = decideCreateOrganization({
      name: 'Polly UX',
      id: '550e8400-e29b-41d4-a716-446655440001',
      now: '2024-06-15T12:00:00.000Z',
    });

    expect(plan).toEqual({
      kind: 'create-organization',
      organization: {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Polly UX',
        createdAt: '2024-06-15T12:00:00.000Z',
      },
    });
  });
});
