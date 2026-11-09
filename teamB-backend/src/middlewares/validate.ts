import type { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { ApiError } from '../utils/apiError.js';

/** Validate request parts against a Zod schema; attach parsed data to res.locals. */
export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        params: req.params,
        query: req.query,
        body: req.body,
      });
      res.locals.validated = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed.', err.flatten().fieldErrors),
        );
      }
      next(err);
    }
  };
}

export const idParam = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
});

export const paginationQuery = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export function pagination(q: { page?: number; limit?: number }) {
  const page = Math.max(1, Number(q.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20)));
  return { page, limit, skip: (page - 1) * limit };
}
