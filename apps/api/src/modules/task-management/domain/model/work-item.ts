import type { Task } from './task.js';

/** Now query documents. The module owns these shapes. Edges map them onto the contract. */

export const NOW_OWNERS = ['all', 'me'] as const;

export type NowOwner = (typeof NOW_OWNERS)[number];

export type NowNextActionItem = {
  task: Task;
  project: {
    id: string;
    name: string;
  };
};
