import { formatShortDate } from './format-timeline-entry';

export function proposedByLine(input: {
  proposerName: string;
  createdAt: string;
  now?: Date;
}): string {
  return `Proposed by ${input.proposerName} · ${formatShortDate(input.createdAt, input.now)}`;
}

export function proposalRestoredToast(actorName: string): string {
  return `${actorName} restored it`;
}

export function proposerLabel(member: {
  name?: string;
  email: string;
  kind: 'human' | 'agent';
} | undefined): string {
  if (!member) {
    return 'Unknown';
  }
  if (member.kind === 'agent') {
    return member.name ?? 'Agent';
  }
  return member.name ?? member.email;
}
