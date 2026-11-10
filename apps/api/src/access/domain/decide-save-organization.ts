import type { SaveOrganizationPlan } from './organization-plan.js';

/**
 * What the caller asked to write. A missing id or createdAt is filled by
 * `planSaveOrganization`. This command has no query and no refusal.
 */
export type CreateOrganizationCommand = {
  /** Optional - will be generated if not provided */
  id?: string;
  name: string;
  /** Optional - will use current time if not provided */
  createdAt?: string;
};

export type SaveOrganizationDecision = {
  readonly name: string;
  readonly id?: string;
  readonly createdAt?: string;
};

/**
 * The command is the whole decision. Get and list stay reads and do not
 * feed this write. An id the caller supplied is kept. A new id is applied
 * only in the plan, and only when the command omitted one.
 */
export const decideSaveOrganization = (
  command: CreateOrganizationCommand
): SaveOrganizationDecision => ({
  name: command.name,
  id: command.id,
  createdAt: command.createdAt,
});

/**
 * The generated id and the clock are applied only where the command left
 * them out. The plan does not read `notes_mirror_bot_user_id` or
 * `time_zone`.
 */
export const planSaveOrganization = (input: {
  readonly decision: SaveOrganizationDecision;
  readonly generatedId: string;
  readonly now: string;
}): SaveOrganizationPlan => ({
  kind: 'save-organization',
  organization: {
    id: input.decision.id ?? input.generatedId,
    name: input.decision.name,
    createdAt: input.decision.createdAt ?? input.now,
  },
});
