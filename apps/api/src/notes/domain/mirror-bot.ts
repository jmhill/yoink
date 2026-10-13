export const NOTES_MIRROR_BOT_NAME = 'Libby notes-mirror';

export const isDesignatedMirrorBot = (input: {
  actorUserId: string;
  designatedUserId: string | null;
}): boolean =>
  input.designatedUserId !== null && input.actorUserId === input.designatedUserId;
