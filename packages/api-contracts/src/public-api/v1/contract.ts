import { oc } from '@orpc/contract';
import {
  captureOrpcContract,
  processCaptureToProjectOrpcContract,
} from '../../orpc/capture-contract.js';
import { listOrpcContract } from '../../orpc/list-contract.js';
import { noteOrpcContract } from '../../orpc/note-contract.js';
import { projectOrpcContract } from '../../orpc/project-contract.js';
import { reviewOrpcContract } from '../../orpc/review-contract.js';
import { taskOrpcContract } from '../../orpc/task-contract.js';
import { tokenOrpcContract } from '../../orpc/token-contract.js';
import { workOrpcContract } from '../../orpc/work-contract.js';
import { withResourcePath } from './resource-path.js';

/**
 * Frozen public API v1. Membership is the integration rows in
 * `docs/architecture/adr/001-route-inventory.md` (59 procedures).
 *
 * Admin, session, passkey, signup, invitation, organization settings,
 * health, fixtures, token create, token delete, agent mint, and member
 * token reissue are not here. `tokens.list` is `GET /api/auth/tokens`.
 *
 * Legacy routers in `src/orpc/` stay mounted at their `/api/...` paths.
 * This module does not register a route.
 */
export const publicApiV1Contract = oc.router({
  captures: oc.router({
    create: withResourcePath(captureOrpcContract.create),
    list: withResourcePath(captureOrpcContract.list),
    get: withResourcePath(captureOrpcContract.get),
    update: withResourcePath(captureOrpcContract.update),
    trash: withResourcePath(captureOrpcContract.trash),
    restore: withResourcePath(captureOrpcContract.restore),
    snooze: withResourcePath(captureOrpcContract.snooze),
    unsnooze: withResourcePath(captureOrpcContract.unsnooze),
    delete: withResourcePath(captureOrpcContract.delete),
    emptyTrash: withResourcePath(captureOrpcContract.emptyTrash),
    process: withResourcePath(captureOrpcContract.process),
    processToProject: withResourcePath(processCaptureToProjectOrpcContract.processToProject),
  }),
  tasks: oc.router({
    create: withResourcePath(taskOrpcContract.create),
    list: withResourcePath(taskOrpcContract.list),
    get: withResourcePath(taskOrpcContract.get),
    update: withResourcePath(taskOrpcContract.update),
    complete: withResourcePath(taskOrpcContract.complete),
    uncomplete: withResourcePath(taskOrpcContract.uncomplete),
    pin: withResourcePath(taskOrpcContract.pin),
    unpin: withResourcePath(taskOrpcContract.unpin),
    listHistory: withResourcePath(taskOrpcContract.listHistory),
    delete: withResourcePath(taskOrpcContract.delete),
  }),
  lists: oc.router({
    list: withResourcePath(listOrpcContract.list),
    create: withResourcePath(listOrpcContract.create),
    rename: withResourcePath(listOrpcContract.rename),
    delete: withResourcePath(listOrpcContract.delete),
    listOpenTasks: withResourcePath(listOrpcContract.listOpenTasks),
    reorderOpenTasks: withResourcePath(listOrpcContract.reorderOpenTasks),
    listUnlistedOpenTasks: withResourcePath(listOrpcContract.listUnlistedOpenTasks),
    reorderUnlistedOpenTasks: withResourcePath(listOrpcContract.reorderUnlistedOpenTasks),
  }),
  projects: oc.router({
    list: withResourcePath(projectOrpcContract.list),
    create: withResourcePath(projectOrpcContract.create),
    stageImport: withResourcePath(projectOrpcContract.stageImport),
    listImports: withResourcePath(projectOrpcContract.listImports),
    getImport: withResourcePath(projectOrpcContract.getImport),
    applyImport: withResourcePath(projectOrpcContract.applyImport),
    discardImport: withResourcePath(projectOrpcContract.discardImport),
    get: withResourcePath(projectOrpcContract.get),
    update: withResourcePath(projectOrpcContract.update),
    listOpenTasks: withResourcePath(projectOrpcContract.listOpenTasks),
    listHistory: withResourcePath(projectOrpcContract.listHistory),
    changeStatus: withResourcePath(projectOrpcContract.changeStatus),
    confirmProposal: withResourcePath(projectOrpcContract.confirmProposal),
    declineProposal: withResourcePath(projectOrpcContract.declineProposal),
    restoreProposal: withResourcePath(projectOrpcContract.restoreProposal),
    setNextAction: withResourcePath(projectOrpcContract.setNextAction),
  }),
  notes: oc.router({
    list: withResourcePath(noteOrpcContract.list),
    get: withResourcePath(noteOrpcContract.get),
    create: withResourcePath(noteOrpcContract.create),
    update: withResourcePath(noteOrpcContract.update),
    delete: withResourcePath(noteOrpcContract.delete),
    listChanged: withResourcePath(noteOrpcContract.listChanged),
    importFromObsidian: withResourcePath(noteOrpcContract.importFromObsidian),
  }),
  work: oc.router({
    listNextActions: withResourcePath(workOrpcContract.listNextActions),
    listDue: withResourcePath(workOrpcContract.listDue),
    listLists: withResourcePath(workOrpcContract.listLists),
  }),
  review: oc.router({
    list: withResourcePath(reviewOrpcContract.list),
    done: withResourcePath(reviewOrpcContract.done),
  }),
  tokens: oc.router({
    list: withResourcePath(tokenOrpcContract.list),
  }),
});
