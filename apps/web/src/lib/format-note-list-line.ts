import { formatShortDate } from './format-timeline-entry.js';

export const formatNoteListStamp = (input: {
  updatedAt: string;
  updatedByName: string;
  now?: Date;
}): string => `${formatShortDate(input.updatedAt, input.now)} · ${input.updatedByName}`;
