import { describe, expect, it } from 'vitest';
import { decideRenameOrganization } from './decide-rename-organization.js';

const organization = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Original',
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('decideRenameOrganization', () => {
  it('keeps the id and createdAt when the workspace exists', () => {
    expect(decideRenameOrganization({ organization, name: 'Renamed' })).toEqual({
      kind: 'rename-organization',
      organization: { ...organization, name: 'Renamed' },
    });
  });

  it('writes nothing when the workspace is missing', () => {
    expect(decideRenameOrganization({ organization: null, name: 'Renamed' })).toBeNull();
  });
});
