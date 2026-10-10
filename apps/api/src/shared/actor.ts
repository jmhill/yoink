/**
 * Command actor seam for the change log.
 *
 * TODO(#132): slot in PR 151's `Actor` (`UserActor | BotActor`) once it merges.
 * That type is assignable here: both variants have `kind` and `userId`.
 * Routes pass `null` until then; lastChangedBy / completedBy / change_log
 * actor columns stay null.
 */
export type Actor = {
  readonly kind: 'user' | 'bot';
  readonly userId: string;
};

export type ActorKind = Actor['kind'];
