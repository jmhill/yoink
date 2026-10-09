import type { ResultAsync } from 'neverthrow';
import type { ReissueAgentTokenCommand } from './token-commands.js';
import type { TokenInfo } from './token-info.js';
import type { DecideReissueAgentTokenError } from './decide-reissue-agent-token.js';
import type { TokenWriteError } from './token-store.js';
import type { UserServiceError } from './user-errors.js';
import type { MembershipServiceError } from './organization-errors.js';

export type ReissueAgentTokenResult = {
  token: TokenInfo;
  rawToken: string;
};

export type ReissueAgentTokenError =
  | DecideReissueAgentTokenError
  | MembershipServiceError
  | UserServiceError
  | TokenWriteError;

export type ReissueAgentToken = (
  command: ReissueAgentTokenCommand
) => ResultAsync<ReissueAgentTokenResult, ReissueAgentTokenError>;
