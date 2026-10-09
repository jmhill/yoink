import type { ResultAsync } from 'neverthrow';
import type { CreateTokenCommand } from './token-commands.js';
import type { CreateTokenError } from './token-errors.js';
import type { TokenInfo } from './token-info.js';

export type CreateToken = (
  command: CreateTokenCommand
) => ResultAsync<{ token: TokenInfo; rawToken: string }, CreateTokenError>;
