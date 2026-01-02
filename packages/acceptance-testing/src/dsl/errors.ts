/**
 * Domain-specific errors for acceptance tests.
 * These provide typed error handling without leaking transport details.
 */

export class DslError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Thrown when an operation requires authentication but none was provided,
 * or the provided credentials are invalid.
 */
export class UnauthorizedError extends DslError {
  constructor(message = 'Unauthorized') {
    super(message);
  }
}

/**
 * Thrown when a requested resource does not exist.
 */
export class NotFoundError extends DslError {
  readonly resource: string;
  readonly resourceId: string;

  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.resource = resource;
    this.resourceId = id;
  }
}

/**
 * Thrown when input validation fails.
 */
export class ValidationError extends DslError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Thrown when an operation is not supported by the current driver.
 */
export class UnsupportedOperationError extends DslError {
  constructor(operation: string, driver: string) {
    super(`Operation '${operation}' is not supported by the ${driver} driver`);
  }
}

/**
 * Thrown when an operation cannot be completed due to a conflict.
 * For example, trying to delete a capture that is not in trash.
 */
export class ConflictError extends DslError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Thrown when attempting to delete the user's last passkey.
 * Users must always have at least one passkey for security.
 */
export class CannotDeleteLastPasskeyError extends DslError {
  constructor() {
    super('Cannot delete your last passkey');
  }
}

/**
 * Thrown when attempting to leave a personal organization.
 * Users cannot leave their personal organization.
 */
export class CannotLeavePersonalOrgError extends DslError {
  constructor() {
    super('Cannot leave your personal organization');
  }
}

/**
 * Thrown when the last admin attempts to leave an organization.
 * The organization must have at least one admin.
 */
export class LastAdminError extends DslError {
  constructor() {
    super('Cannot leave as the last admin');
  }
}

/**
 * Thrown when a user is not a member of the specified organization.
 */
export class NotMemberError extends DslError {
  constructor(organizationId: string) {
    super(`Not a member of organization: ${organizationId}`);
  }
}

/**
 * Thrown when a user does not have permission to perform an operation.
 */
export class ForbiddenError extends DslError {
  constructor(message = 'Permission denied') {
    super(message);
  }
}

/**
 * Thrown when attempting to remove yourself from an organization.
 * Use the leave endpoint instead.
 */
export class CannotRemoveSelfError extends DslError {
  constructor() {
    super('Cannot remove yourself. Use leave instead.');
  }
}
