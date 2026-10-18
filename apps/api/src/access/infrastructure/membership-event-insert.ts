import type {
  MembershipEvent,
  MemberRoleChanged,
  OwnerAssigned,
} from '../domain/membership-events.js';

export type MembershipEventInsertQuery = {
  sql: string;
  args: unknown[];
};

const EVENT_INSERT_SQL = `
  INSERT INTO membership_events (
    id, type, organization_id, user_id,
    from_user_id, to_user_id, from_role, to_role,
    actor_kind, actor_user_id, occurred_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const memberRoleChangedActorColumns = (
  actor: MemberRoleChanged['actor']
): { actorKind: 'member' | 'app-admin'; actorUserId: string | null } => {
  switch (actor.kind) {
    case 'member':
      return { actorKind: 'member', actorUserId: actor.userId };
    case 'app-admin':
      return { actorKind: 'app-admin', actorUserId: null };
  }
};

const ownerAssignedActorColumns = (
  actor: OwnerAssigned['actor']
): { actorKind: 'app-admin' | 'self'; actorUserId: string | null } => {
  switch (actor.kind) {
    case 'app-admin':
      return { actorKind: 'app-admin', actorUserId: null };
    case 'self':
      return { actorKind: 'self', actorUserId: actor.userId };
  }
};

export const eventInsert = (event: MembershipEvent): MembershipEventInsertQuery => {
  switch (event.type) {
    case 'OwnershipTransferred':
      return {
        sql: EVENT_INSERT_SQL,
        args: [
          event.id,
          event.type,
          event.organizationId,
          event.toUserId,
          event.fromUserId,
          event.toUserId,
          null,
          null,
          'member',
          event.actorUserId,
          event.occurredAt,
        ],
      };
    case 'MemberRoleChanged': {
      const actor = memberRoleChangedActorColumns(event.actor);
      return {
        sql: EVENT_INSERT_SQL,
        args: [
          event.id,
          event.type,
          event.organizationId,
          event.userId,
          null,
          null,
          event.fromRole,
          event.toRole,
          actor.actorKind,
          actor.actorUserId,
          event.occurredAt,
        ],
      };
    }
    case 'MemberRemoved':
      return {
        sql: EVENT_INSERT_SQL,
        args: [
          event.id,
          event.type,
          event.organizationId,
          event.userId,
          null,
          null,
          event.role,
          null,
          'member',
          event.actorUserId,
          event.occurredAt,
        ],
      };
    case 'MemberLeft':
      return {
        sql: EVENT_INSERT_SQL,
        args: [
          event.id,
          event.type,
          event.organizationId,
          event.userId,
          null,
          null,
          event.role,
          null,
          'self',
          event.userId,
          event.occurredAt,
        ],
      };
    case 'OwnerAssigned': {
      const actor = ownerAssignedActorColumns(event.actor);
      return {
        sql: EVENT_INSERT_SQL,
        args: [
          event.id,
          event.type,
          event.organizationId,
          event.userId,
          event.previousOwnerUserId,
          null,
          event.fromRole,
          'owner',
          actor.actorKind,
          actor.actorUserId,
          event.occurredAt,
        ],
      };
    }
  }
};
