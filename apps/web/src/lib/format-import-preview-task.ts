import type { ImportPreviewTask } from '@yoink/api-contracts';

const formatDueDate = (dueDate: string): string => {
  const due = new Date(`${dueDate}T00:00:00`);
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const formatImportPreviewTaskLine = (task: ImportPreviewTask): string => {
  const parts = [`${task.title} (${task.source})`];
  if (task.source === 'existing' && task.dueDate) {
    parts.push(formatDueDate(task.dueDate));
  }
  if (task.source === 'existing' && task.assigneeName) {
    parts.push(task.assigneeName);
  }
  return parts.join(' · ');
};
