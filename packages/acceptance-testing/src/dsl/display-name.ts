/** First label of an email local-part: alice-history@x.com → Alice. */
export const displayNameFromEmail = (email: string): string => {
  const localPart = email.split('@')[0] ?? 'User';
  const first = localPart.split(/[.+-]/)[0] ?? localPart;
  const trimmed = first.trim();
  if (trimmed.length === 0) {
    return 'User';
  }
  return `${trimmed[0]!.toUpperCase()}${trimmed.slice(1).toLowerCase()}`;
};
