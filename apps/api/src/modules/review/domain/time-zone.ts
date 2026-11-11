/**
 * Same predicate as the contract time-zone schema: a non-empty string
 * `Intl.DateTimeFormat` accepts as `timeZone`. Review does not import that schema.
 */
export const isIanaTimeZone = (value: string): boolean => {
  if (value.length === 0) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};
