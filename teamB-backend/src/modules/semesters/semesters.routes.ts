import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../utils/apiError.js';

async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await prisma.semester.findMany({
      orderBy: { id: 'asc' },
      include: {
        _count: { select: { records: true, registrations: true } },
        academicYear: { select: { code: true } },
      },
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const id = z.object({ params: z.object({ id: z.coerce.number().int().positive() }) })
      .parse({ params: req.params }).params.id;
    const row = await prisma.semester.findUnique({ where: { id } });
    if (!row) throw notFound('Semester not found.');
    res.json(row);
  } catch (err) {
    next(err);
  }
}

export default { list, getOne };
