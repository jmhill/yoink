/** First label of an email local-part: alice-history@x.com → Alice. */
export const displayNameFromEmail = (email: string): string => {
  const localPart = email.split('@')[0] ?? 'User';
  const first = localPart.split(/[.+-]/)[0] ?? localPart;
  const trimmed = first.trim();
  const initial = trimmed.charAt(0);
  if (initial.length === 0) {
    return 'User';
  }
  return `${initial.toUpperCase()}${trimmed.slice(1).toLowerCase()}`;
};
