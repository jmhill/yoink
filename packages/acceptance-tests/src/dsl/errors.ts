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
