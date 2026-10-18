/** Trim surrounding spaces and ignore capitals when matching an email. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
