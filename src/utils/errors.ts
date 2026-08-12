export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toErrorBody(err: AppError) {
  const body: { error: { code: string; message: string; details?: unknown } } = {
    error: { code: err.code, message: err.message },
  };
  if (process.env.NODE_ENV !== 'production' && err.details) {
    body.error.details = err.details;
  }
  return body;
}

export function badRequest(message: string, code = 'INVALID_INPUT', details?: unknown): AppError {
  return new AppError(400, code, message, details);
}

export function unauthorized(message = 'Authentication required'): AppError {
  return new AppError(401, 'UNAUTHENTICATED', message);
}

export function forbidden(message = 'Forbidden'): AppError {
  return new AppError(403, 'FORBIDDEN', message);
}

export function notFound(message = 'Not found'): AppError {
  return new AppError(404, 'NOT_FOUND', message);
}

export function conflict(message: string, code: string): AppError {
  return new AppError(409, code, message);
}

export function internal(message = 'An unexpected error occurred'): AppError {
  return new AppError(500, 'INTERNAL_ERROR', message);
}

export const ErrorCodes = {
  INVALID_INPUT: 'INVALID_INPUT',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
  IDEMPOTENCY_IN_PROGRESS: 'IDEMPOTENCY_IN_PROGRESS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
