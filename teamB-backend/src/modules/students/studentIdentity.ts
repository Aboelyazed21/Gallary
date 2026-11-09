import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';

/**
 * Populate req.studentId for STUDENT principals so ownership checks are
 * possible without extra DB lookups in every handler.
 */
export async function middleware(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.role === 'STUDENT') {
    try {
      const student = await prisma.student.findUnique({ where: { userId: req.auth.userId } });
      if (student) req.studentId = student.id;
    } catch {
      /* best effort — handlers re-check ownership */
    }
  }
  next();
}
