import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { AppError, badRequest, internal, toErrorBody } from '../utils/errors.js';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      (req as Request & { validatedQuery: T }).validatedQuery = schema.parse(req.query);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(toErrorBody(err));
    return;
  }

  if (err instanceof ZodError) {
    const appErr = badRequest('Validation failed', 'INVALID_INPUT', err.flatten());
    res.status(appErr.statusCode).json(toErrorBody(appErr));
    return;
  }

  console.error('Unhandled error:', err);
  const appErr = internal();
  res.status(appErr.statusCode).json(toErrorBody(appErr));
}
