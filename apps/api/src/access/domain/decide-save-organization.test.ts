import { describe, expect, it } from 'vitest';
import { decideSaveOrganization, planSaveOrganization } from './decide-save-organization.js';

const GENERATED = '550e8400-e29b-41d4-a716-446655440099';
const NOW = '2024-01-15T10:00:00.000Z';

describe('decideSaveOrganization', () => {
  it('keeps the name and leaves a missing id and createdAt unset', () => {
    expect(decideSaveOrganization({ name: 'New Org' })).toEqual({
      name: 'New Org',
      id: undefined,
      createdAt: undefined,
    });
  });

  it('keeps an id and createdAt the command already has', () => {
    expect(
      decideSaveOrganization({
        id: 'custom-org-id',
        name: 'Custom ID Org',
        createdAt: '2023-06-15T12:00:00.000Z',
      })
    ).toEqual({
      name: 'Custom ID Org',
      id: 'custom-org-id',
      createdAt: '2023-06-15T12:00:00.000Z',
    });
  });
});

describe('planSaveOrganization', () => {
  it('applies the generated id and the clock only after the decision', () => {
    const plan = planSaveOrganization({
      decision: decideSaveOrganization({ name: 'New Org' }),
      generatedId: GENERATED,
      now: NOW,
    });

    expect(plan).toEqual({
      kind: 'save-organization',
      organization: {
        id: GENERATED,
        name: 'New Org',
        createdAt: NOW,
      },
    });
  });

  it('does not replace an id or createdAt the command supplied', () => {
    const plan = planSaveOrganization({
      decision: decideSaveOrganization({
        id: 'custom-org-id',
        name: 'Custom ID Org',
        createdAt: '2023-06-15T12:00:00.000Z',
      }),
      generatedId: GENERATED,
      now: NOW,
    });

    expect(plan.organization.id).toBe('custom-org-id');
    expect(plan.organization.createdAt).toBe('2023-06-15T12:00:00.000Z');
    expect(plan.kind).toBe('save-organization');
  });
});
