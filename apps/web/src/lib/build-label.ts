/**
 * Settings > About shows this so "did the new build land?" has a
 * short, findable answer. Full SHA stays available as a title tooltip.
 */
export const formatBuildLabel = (commitSha: string): string =>
  commitSha === 'dev' ? 'dev' : commitSha.slice(0, 7);
