export const formatImportPreviewSummary = (input: {
  projectCount: number;
  existingTaskCount: number;
  newTaskCount: number;
  warningCount: number;
}): string => {
  const projects = `${input.projectCount} project${input.projectCount === 1 ? '' : 's'}`;
  const existing = `${input.existingTaskCount} existing task${input.existingTaskCount === 1 ? '' : 's'}`;
  const warnings = `${input.warningCount} warning${input.warningCount === 1 ? '' : 's'}`;
  return `${projects} · ${existing} · ${input.newTaskCount} new · ${warnings}`;
};
