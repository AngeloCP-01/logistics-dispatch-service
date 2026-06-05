export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;
}

export class ValidationError extends DomainError {
  readonly code = "validation_failed";
  readonly status = 400;
  constructor(public readonly errors: { field: string; message: string }[]) {
    super("Validation failed");
  }
}

export class NotFoundError extends DomainError {
  readonly code = "not_found";
  readonly status = 404;
  constructor(resource: string, id: string) {
    super(`${resource} ${id} not found`);
  }
}

export class ConflictError extends DomainError {
  readonly code = "conflict";
  readonly status = 409;
  constructor(message: string) {
    super(message);
  }
}

export class UnauthorizedError extends DomainError {
  readonly code = "unauthorized";
  readonly status = 401;
  constructor(message = "unauthorized") {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  readonly code = "forbidden";
  readonly status = 403;
  constructor(message = "forbidden") {
    super(message);
  }
}

export class UnprocessableEntityError extends DomainError {
  readonly code = "unprocessable_entity";
  readonly status = 422;
  constructor(message: string) {
    super(message);
  }
}

export class RoleRequiredError extends ForbiddenError {
  constructor(required: string, actual: string) {
    super(`requires role ${required}, got ${actual}`);
  }
}

export class InvariantViolationError extends DomainError {
  readonly code = "invariant_violation";
  readonly status = 400;
  constructor(message: string) {
    super(message);
  }
}

export class AssignmentNotFoundError extends NotFoundError {
  constructor(orderId: string) {
    super("assignment", orderId);
  }
}

export class NoActiveOfferError extends ConflictError {
  constructor() {
    super("no active offer for this assignment");
  }
}

export class NotOfferedDriverError extends ForbiddenError {
  constructor() {
    super("driver was not offered this order");
  }
}

export class ForceAssignNotAllowedError extends ConflictError {
  constructor(status: string) {
    super(`cannot force-assign an order in status ${status}`);
  }
}

export class DriverNotAssignableError extends UnprocessableEntityError {
  constructor(driverId: string) {
    super(`driver ${driverId} is not a current, assignable driver`);
  }
}
