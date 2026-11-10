import { implement } from '@orpc/server';
import { webWorkContract } from '@yoink/api-contracts/web';
import { principalKindOf } from '../../access/domain/user.js';
import type { MembershipService } from '../../access/application/handle-membership.js';
import type { UserService } from '../../access/application/handle-user.js';
import { resolveViewerToday } from '../../kernel/viewer-today.js';
import type { WorkHandlers } from '../../modules/task-management/index.js';
import { toWorkListsBody } from '../_shared/http-listed-page.js';
import type { OrpcHttpContext } from '../_shared/orpc/http-context.js';
import { membershipFailure, userFailure } from './settings-errors.js';
import { arrangeWorkSections, workOwnerLabel, type ArrangedWorkRow } from './work-sections.js';
import {
  mapListDueError,
  mapListNextActionsError,
  mapListWorkListsError,
} from './work-errors.js';

/**
 * Methods this screen calls. The rest of each handler stays off the port.
 * Task writes stay on the alias.
 */
export type WebWorkDependencies = {
  workHandlers: Pick<WorkHandlers, 'listNextActions' | 'listDue' | 'listLists'>;
  membershipService: Pick<MembershipService, 'listMemberships'>;
  userService: Pick<UserService, 'getUsersByIds'>;
};

const screenRow = (row: ArrangedWorkRow, ownerLabel: string | undefined) => ({
  task: row.task,
  ...(row.projectLabel === undefined ? {} : { projectLabel: row.projectLabel }),
  ...(row.projectId === undefined ? {} : { projectId: row.projectId }),
  ...(ownerLabel === undefined ? {} : { ownerLabel }),
  source: row.source,
});

/**
 * Work screen and work lists. The screen calls the Now and due queries,
 * then member reads for owner labels. It does not call a command. Pages
 * stay in Task Management order. This edge arranges them into sections and
 * adds the query totals and labels. It does not sort. Lists are one query.
 */
export const createWebWorkHandlers = (deps: WebWorkDependencies) => {
  const work = implement(webWorkContract).$context<OrpcHttpContext>();

  return work.router({
    screen: work.screen.handler(async ({ input, context }) => {
      const organizationId = context.request.authContext.organizationId;
      const viewerId = context.request.authContext.userId;
      const nextResult = await deps.workHandlers.listNextActions({
        organizationId,
        callerId: viewerId,
        owner: input.owner,
        limit: input.limit,
      });
      if (nextResult.isErr()) {
        throw mapListNextActionsError(nextResult.error);
      }
      const dueResult = await deps.workHandlers.listDue({
        organizationId,
        callerId: viewerId,
        owner: input.owner,
        limit: input.limit,
        timeZone: input.timeZone,
      });
      if (dueResult.isErr()) {
        throw mapListDueError(dueResult.error);
      }

      const membersResult = await deps.membershipService.listMemberships({ organizationId });
      if (membersResult.isErr()) {
        throw membershipFailure(membersResult.error, 'Failed to list members');
      }
      const usersResult = await deps.userService.getUsersByIds(
        membersResult.value.map((membership) => membership.userId)
      );
      if (usersResult.isErr()) {
        throw userFailure(usersResult.error, 'Failed to fetch user details');
      }

      const usersById = new Map(usersResult.value.map((user) => [user.id, user]));
      const members = membersResult.value.flatMap((membership) => {
        const user = usersById.get(membership.userId);
        if (user === undefined) {
          return [];
        }
        return [
          {
            userId: user.id,
            email: user.email,
            ...(user.name === undefined ? {} : { name: user.name }),
            kind: principalKindOf(user),
          },
        ];
      });

      const today = resolveViewerToday({
        now: new Date(),
        timeZone: input.timeZone,
      });
      const sections = arrangeWorkSections({
        nextActions: nextResult.value.items,
        dueTasks: dueResult.value.items,
        today,
      });

      return {
        nextActionCount: nextResult.value.total,
        dueCount: dueResult.value.total,
        sections: sections.map((section) => ({
          name: section.name,
          rows: section.rows.map((row) =>
            screenRow(row, workOwnerLabel(row.task.assigneeId, viewerId, members))
          ),
        })),
      };
    }),
    listLists: work.listLists.handler(async ({ input, context }) => {
      const result = await deps.workHandlers.listLists({
        organizationId: context.request.authContext.organizationId,
        limit: input.limit,
        cursor: input.cursor,
      });
      return result.match(
        (page) => toWorkListsBody(page),
        (error) => {
          throw mapListWorkListsError(error);
        }
      );
    }),
  });
};
