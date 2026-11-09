import { createInMemoryUnitOfWork } from '../platform/unit-of-work/in-memory-unit-of-work.js';
import { createAccess, type Access, type AccessDependencies } from './application/create-access.js';
import { createFakeSignupParticipant } from './infrastructure/fakes/fake-signup-participant.js';

export { createFakeSignupParticipant } from './infrastructure/fakes/fake-signup-participant.js';

export const createFakeAccess = (
  deps: Omit<AccessDependencies, 'unitOfWork'> & {
    readonly unitOfWork?: AccessDependencies['unitOfWork'];
    readonly emails?: Set<string>;
  }
): Access => {
  const emails = deps.emails ?? new Set<string>();
  const unitOfWork =
    deps.unitOfWork ??
    createInMemoryUnitOfWork({
      participants: [createFakeSignupParticipant(emails)],
    });
  return createAccess({ ...deps, unitOfWork });
};
