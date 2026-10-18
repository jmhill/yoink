import type { Member, MembershipRole } from '@yoink/api-contracts';

export type MemberRowViewer = {
  userId: string;
  role: MembershipRole;
};

const isOwnerOrAdmin = (role: MembershipRole): boolean =>
  role === 'owner' || role === 'admin';

/** Hide-only. The server decides. */
export const canChangeRole = (viewer: MemberRowViewer, target: Member): boolean => {
  if (!isOwnerOrAdmin(viewer.role)) {
    return false;
  }
  if (target.kind === 'agent') {
    return false;
  }
  if (target.role === 'owner') {
    return false;
  }
  if (target.userId === viewer.userId) {
    return false;
  }
  return true;
};

/** The role the row does not already have. */
export const roleActionFor = (target: Member): 'admin' | 'member' | null => {
  if (target.role === 'member') {
    return 'admin';
  }
  if (target.role === 'admin') {
    return 'member';
  }
  return null;
};

/** Hide-only. The server decides. */
export const canRemove = (viewer: MemberRowViewer, target: Member): boolean => {
  if (!isOwnerOrAdmin(viewer.role)) {
    return false;
  }
  if (target.userId === viewer.userId) {
    return false;
  }
  if (target.role === 'owner') {
    return false;
  }
  return true;
};

/** Hide-only. The server decides. */
export const canReissue = (viewer: MemberRowViewer, target: Member): boolean => {
  if (!isOwnerOrAdmin(viewer.role)) {
    return false;
  }
  return target.kind === 'agent';
};
