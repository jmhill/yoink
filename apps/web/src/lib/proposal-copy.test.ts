import { describe, expect, it } from 'vitest';
import { proposedByLine, proposalRestoredToast, proposerLabel } from './proposal-copy';

describe('proposedByLine', () => {
  it('names the proposer and a short date', () => {
    expect(
      proposedByLine({
        proposerName: 'Lane',
        createdAt: '2026-10-13T12:00:00.000Z',
        now: new Date('2026-10-13T18:00:00.000Z'),
      })
    ).toBe('Proposed by Lane · Oct 13');
  });
});

describe('proposalRestoredToast', () => {
  it('matches the timeline restore wording', () => {
    expect(proposalRestoredToast('Justin')).toBe('Justin restored it');
  });
});

describe('proposerLabel', () => {
  it('uses an agent name and a person name or email', () => {
    expect(proposerLabel({ kind: 'agent', name: 'Lane', email: 'lane@bot' })).toBe('Lane');
    expect(proposerLabel({ kind: 'human', name: 'Justin', email: 'justin@example.com' })).toBe(
      'Justin'
    );
    expect(proposerLabel({ kind: 'human', email: 'justin@example.com' })).toBe('justin@example.com');
    expect(proposerLabel(undefined)).toBe('Unknown');
  });
});
