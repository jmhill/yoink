import type { Member as ContractMember, Project as ContractProject } from '@yoink/api-contracts';

/** Member fields access returns. The edge does not import the access module here. */
export type MemberDocument = {
  userId: string;
  email: string;
  name?: string;
  kind: 'human' | 'agent';
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
};

/** Copy a member document onto the contract member, in schema field order. */
export const toContractMember = (member: MemberDocument): ContractMember => ({
  userId: member.userId,
  email: member.email,
  name: member.name,
  kind: member.kind,
  role: member.role,
  joinedAt: member.joinedAt,
});

export const toContractMemberTransfer = (view: {
  owner: MemberDocument;
  previousOwner: MemberDocument;
}): { owner: ContractMember; previousOwner: ContractMember } => ({
  owner: toContractMember(view.owner),
  previousOwner: toContractMember(view.previousOwner),
});

/** Project fields the admin back-date command returns. */
export type AdminProjectDocument = {
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  status: 'active' | 'waiting' | 'someday' | 'done' | 'proposed' | 'declined';
  waitingOn: string | null;
  waitingSince: string | null;
  nextActionTaskId: string | null;
  notebookPages: { path: string; url: string }[];
  createdAt: string;
  lastChangedAt: string | null;
  lastChangedBy: string | null;
  objective?: string;
  reason?: string;
  suggestedNextAction?: string;
};

/** Copy the admin project document onto the contract project. */
export const toContractAdminProject = (project: AdminProjectDocument): ContractProject => ({
  id: project.id,
  organizationId: project.organizationId,
  createdById: project.createdById,
  name: project.name,
  status: project.status,
  waitingOn: project.waitingOn,
  waitingSince: project.waitingSince,
  nextActionTaskId: project.nextActionTaskId,
  notebookPages: project.notebookPages.map((page) => ({ path: page.path, url: page.url })),
  createdAt: project.createdAt,
  lastChangedAt: project.lastChangedAt,
  lastChangedBy: project.lastChangedBy,
  ...(project.objective !== undefined ? { objective: project.objective } : {}),
  ...(project.reason !== undefined ? { reason: project.reason } : {}),
  ...(project.suggestedNextAction !== undefined
    ? { suggestedNextAction: project.suggestedNextAction }
    : {}),
});
