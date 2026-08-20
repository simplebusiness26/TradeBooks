/** Errors that carry a safe, user-facing message. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = options.status ?? 400;
    this.code = options.code ?? 'bad_request';
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Please sign in to continue.') {
    super(message, { status: 401, code: 'unauthenticated' });
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to do that.') {
    super(message, { status: 403, code: 'forbidden' });
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'That record could not be found.') {
    super(message, { status: 404, code: 'not_found' });
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  readonly fieldErrors: Record<string, string[]>;
  constructor(message = 'Please check the highlighted fields.', fieldErrors: Record<string, string[]> = {}) {
    super(message, { status: 422, code: 'validation_failed' });
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

export class ConflictError extends AppError {
  constructor(message = 'That change conflicts with an existing record.') {
    super(message, { status: 409, code: 'conflict' });
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many attempts. Please wait a moment and try again.') {
    super(message, { status: 429, code: 'rate_limited' });
    this.name = 'RateLimitError';
  }
}

/** Converts any thrown value into a message safe to show a user. */
export function toUserMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  return 'Something went wrong. Please try again.';
}
