export const MODULE_NAMES = [
  'access',
  'captures',
  'task-management',
  'notes',
  'review',
  'history',
] as const;

export type ModuleName = (typeof MODULE_NAMES)[number];
