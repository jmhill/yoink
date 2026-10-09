import type { TokenProjection } from './token-info.js';
import type { TokenEvent } from './token-events.js';

export const applyTokenEvent = (
  current: TokenProjection | null,
  event: TokenEvent
): TokenProjection | null => {
  switch (event.type) {
    case 'TokenCreated':
      return {
        id: event.id,
        name: event.name,
        lastUsedAt: undefined,
        createdAt: event.createdAt,
      };
    case 'TokenRenamed':
      if (!current) {
        return null;
      }
      return {
        ...current,
        name: event.name,
      };
    case 'TokenRevoked':
      return null;
  }
};
