import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/apiError.js';

/** Zod / Prisma error normalisation. Keep messages safe (no stack leak). */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: err.flatten().fieldErrors,
      },
    });
  }

  const anyErr = err as unknown as { code?: string; meta?: { target?: string[] } };

  if (anyErr.code === 'P2002') {
    return res.status(409).json({
      error: {
        code: 'UNIQUE_CONSTRAINT_VIOLATION',
        message: `A record with this value already exists${anyErr.meta?.target?.length ? ` (${anyErr.meta.target.join(', ')})` : ''}.`,
      },
    });
  }
  if (anyErr.code === 'P2025') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found.' } });
  }
  if (anyErr.code === 'P2003') {
    return res.status(409).json({
      error: { code: 'FOREIGN_KEY_CONSTRAINT', message: 'Referenced record does not exist.' },
    });
  }

  // Prisma Zod-like validation errors handled by validate middleware before reaching here.
  // eslint-disable-next-line no-console
  console.error('[unhandled]', err);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  });
}
