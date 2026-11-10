import type { CreateUserPlan } from './user-plan.js';
import type { User } from './user.js';

/**
 * What the caller asked to write. The id and createdAt are already chosen.
 * This command has no query and no refusal.
 */
export type CreateUserCommand = {
  id: string;
  email: string;
  name?: string;
  kind?: 'human' | 'agent';
  createdAt: string;
};

export type CreateUserDecision = {
  readonly id: string;
  readonly email: string;
  readonly name?: string;
  readonly kind?: 'human' | 'agent';
  readonly createdAt: string;
};

/**
 * The command is the whole decision. Lookups stay reads and do not feed
 * this write. An omitted name or kind stays omitted on the user. The SQL
 * default for kind is applied only when the plan is compiled.
 */
export const decideCreateUser = (command: CreateUserCommand): CreateUserDecision => ({
  id: command.id,
  email: command.email,
  createdAt: command.createdAt,
  ...(command.name === undefined ? {} : { name: command.name }),
  ...(command.kind === undefined ? {} : { kind: command.kind }),
});

/** The plan is that decision. Signup's guarded insert is a different plan. */
export const planCreateUser = (decision: CreateUserDecision): CreateUserPlan => ({
  kind: 'create-user',
  user: {
    id: decision.id,
    email: decision.email,
    createdAt: decision.createdAt,
    ...(decision.name === undefined ? {} : { name: decision.name }),
    ...(decision.kind === undefined ? {} : { kind: decision.kind }),
  } satisfies User,
});
