/**
 * CodeGenerator interface for generating short invitation codes.
 */
export type CodeGenerator = {
  generate(): string;
};

/**
 * Creates a code generator that produces cryptographically random alphanumeric codes.
 * Default length is 8 characters.
 */
export const createCodeGenerator = (length = 8): CodeGenerator => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes I, O, 0, 1 for readability
  
  return {
    generate(): string {
      const randomBytes = crypto.getRandomValues(new Uint8Array(length));
      return Array.from(randomBytes)
        .map((byte) => chars[byte % chars.length])
        .join('');
    },
  };
};

/**
 * Creates a fake code generator for testing.
 * Returns sequential codes like CODE0001, CODE0002, etc.
 */
export const createFakeCodeGenerator = (prefix = 'CODE'): CodeGenerator => {
  let counter = 1;
  
  return {
    generate(): string {
      return `${prefix}${String(counter++).padStart(4, '0')}`;
    },
  };
};

export type FakeCodeGenerator = ReturnType<typeof createFakeCodeGenerator>;
