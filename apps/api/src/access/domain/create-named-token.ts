import type { ResultAsync } from 'neverthrow';
import type { CreateNamedTokenCommand } from './token-commands.js';
import type { CreateNamedTokenError } from './token-errors.js';
import type { TokenInfo } from './token-info.js';

export type CreateNamedToken = (
  command: CreateNamedTokenCommand
) => ResultAsync<{ token: TokenInfo; rawToken: string }, CreateNamedTokenError>;
