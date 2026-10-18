import type { MembershipRole } from './organization-membership.js';

export type OwnershipTransferred = {
  type: 'OwnershipTransferred';
  id: string;
  organizationId: string;
  fromUserId: string;
  toUserId: string;
  actorUserId: string;
  occurredAt: string;
};

export type MemberRoleChangedActor =
  | { kind: 'member'; userId: string }
  | { kind: 'app-admin' };

export type MemberRoleChanged = {
  type: 'MemberRoleChanged';
  id: string;
  organizationId: string;
  userId: string;
  fromRole: MembershipRole;
  toRole: MembershipRole;
  actor: MemberRoleChangedActor;
  occurredAt: string;
};

export type MemberRemoved = {
  type: 'MemberRemoved';
  id: string;
  organizationId: string;
  userId: string;
  role: MembershipRole;
  actorUserId: string;
  occurredAt: string;
};

export type MemberLeft = {
  type: 'MemberLeft';
  id: string;
  organizationId: string;
  userId: string;
  role: MembershipRole;
  occurredAt: string;
};

export type MembershipEvent =
  | OwnershipTransferred
  | MemberRoleChanged
  | MemberRemoved
  | MemberLeft;
