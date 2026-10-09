import type { TokenInfo } from './token-info.js';
import type { TokenEvent } from './token-events.js';

export const applyTokenEvent = (
  _current: TokenInfo | null,
  event: TokenEvent
): TokenInfo | null => {
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
