/**
 * The rail omits the Proposed group when it has no rows.
 * Waiting for that group is only valid when at least one name is expected.
 */
export const proposedGroupExpectation = (
  names: readonly string[]
): 'rows' | 'omitted' => (names.length === 0 ? 'omitted' : 'rows');
