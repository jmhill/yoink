export type OwnershipTransferred = {
  type: 'OwnershipTransferred';
  id: string;
  organizationId: string;
  fromUserId: string;
  toUserId: string;
  actorUserId: string;
  occurredAt: string;
};
