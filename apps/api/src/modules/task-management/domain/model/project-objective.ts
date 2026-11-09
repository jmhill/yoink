export const parseProjectObjective = (raw: string | undefined | null): string | undefined => {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  const objective = raw.trim();
  return objective.length < 1 ? undefined : objective;
};
