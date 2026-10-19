export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype); // Restore prototype chain
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Unauthenticated") {
    super(message, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Unauthorized to perform this action") {
    super(message, 403);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access forbidden") {
    super(message, 403);
  }
}

export class ValidationError extends AppError {
  public readonly details: unknown;
  
  constructor(message = "Validation Error", details?: unknown) {
    super(message, 400);
    this.details = details;
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please try again later.") {
    super(message, 429);
  }
}


export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404);
  }
}
