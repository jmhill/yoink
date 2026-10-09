import type { TokenProjection } from './token-info.js';
import type { TokenEvent } from './token-events.js';

export const applyTokenEvent = (
  _current: TokenProjection | null,
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
    case 'TokenRevoked':
      return null;
  }
};
