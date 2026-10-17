import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { ApiError } from './ApiError';

interface MongoLikeError extends Error {
  code?: number;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
  errors?: Record<string, { message?: string }>;
}

/** Wraps async route handlers so rejections reach the error middleware. */
export const asyncHandler =
  <T>(fn: (req: Request, res: Response, next: NextFunction) => Promise<T>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

const normaliseZodErrors = (error: ZodError): Array<{ field: string; message: string }> =>
  error.issues.map((issue) => ({
    field: issue.path.join('.') || 'request',
    message: issue.message,
  }));

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  let statusCode = 500;
  let message = 'Internal server error';
  let errors: unknown[] = [];

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (err instanceof ZodError) {
    statusCode = 422;
    message = 'Validation failed';
    errors = normaliseZodErrors(err);
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 422;
    message = 'Validation failed';
    errors = Object.entries(err.errors ?? {}).map(([field, detail]) => ({
      field,
      message: (detail as { message?: string })?.message ?? 'Invalid value',
    }));
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.stringValue}`;
  } else if (err instanceof mongoose.Error.DocumentNotFoundError) {
    statusCode = 404;
    message = 'Resource not found';
  } else if (typeof err === 'object' && err !== null && 'code' in err) {
    // Mongoose surfaces duplicate-key failures as MongoServerError (code 11000)
    // rather than a dedicated mongoose error class.
    const mongoErr = err as MongoLikeError;
    if (mongoErr.code === 11000) {
      const field = Object.keys(mongoErr.keyPattern ?? {})[0] ?? 'field';
      statusCode = 409;
      message = `Duplicate value for ${field}`;
      errors = [{ field, message: `${field} already in use` }];
    }
  }

  const isProd = env.isProd;
  const payload: Record<string, unknown> = { success: false, message };
  if (errors.length) payload.errors = errors;
  if (!isProd && err instanceof Error && err.stack) payload.stack = err.stack;
  else if (!isProd && statusCode >= 500) payload.detail = String(err);

  if (statusCode >= 500) {
    console.error('[error]', err);
  }

  res.status(statusCode).json(payload);
};