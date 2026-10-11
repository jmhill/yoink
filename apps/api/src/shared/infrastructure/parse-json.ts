import { Result } from 'neverthrow';

export const parseJson = (raw: string): Result<unknown, unknown> =>
  Result.fromThrowable(
    (): unknown => JSON.parse(raw),
    (cause) => cause
  )();
