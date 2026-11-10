export type WorkScreenSectionName = 'due' | 'next-actions';

/**
 * Section titles for the Work screen. The edge arranges the rows.
 * This file only names the groups.
 */
export const workScreenSectionCopy = (
  name: WorkScreenSectionName
): { readonly title: string; readonly emptyMessage: string } => {
  switch (name) {
    case 'due':
      return { title: 'Due', emptyMessage: 'Nothing due' };
    case 'next-actions':
      return { title: 'Next actions', emptyMessage: 'No next actions' };
    default: {
      const unexpected: never = name;
      return unexpected;
    }
  }
};
