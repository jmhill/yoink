import type { IdGenerator } from './id-generator.js';

export const createFakeIdGenerator = (predefinedIds: string[] = []): IdGenerator => {
  let predefinedIndex = 0;
  let fallbackCounter = 0;

  return {
    generate: () => {
      if (predefinedIndex < predefinedIds.length) {
        const id = predefinedIds[predefinedIndex];
        predefinedIndex++;
        return id;
      }

      fallbackCounter++;
      // Generate a valid UUID v4 format for fallback
      const hex = fallbackCounter.toString(16).padStart(12, '0');
      return `00000000-0000-4000-8000-${hex}`;
    },
  };
};
