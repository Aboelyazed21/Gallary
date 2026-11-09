import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../utils/apiError.js';

const listQuery = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    programId: z.coerce.number().int().positive().optional(),
    search: z.string().min(1).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  }),
});

const idSchema = z.object({ params: z.object({ id: z.coerce.number().int().positive() }) });

async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const q = listQuery.parse({ query: req.query }).query;
    const where: Record<string, unknown> = {};
    if (q.programId) where.programId = q.programId;
    if (q.status) where.status = q.status;
    if (q.search) where.OR = [{ code: { contains: q.search } }, { titleEn: { contains: q.search } }];
    const [total, rows] = await Promise.all([
      prisma.course.count({ where }),
      prisma.course.findMany({
        where,
        include: {
          _count: { select: { prerequisites: true } },
        },
        orderBy: { code: 'asc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    res.json({ total, rows, page: q.page, limit: q.limit });
  } catch (err) {
    next(err);
  }
}

async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const id = idSchema.parse({ params: req.params }).params;
    const course = await prisma.course.findUnique({
      where: { id: id.id },
      include: {
        program: true,
        prerequisites: { include: { prerequisiteCourse: { select: { id: true, code: true, titleEn: true, creditHours: true } } } },
        requiredBy: { include: { course: { select: { id: true, code: true, titleEn: true } } } },
      },
    });
    if (!course) throw notFound('Course not found.');
    res.json(course);
  } catch (err) {
    next(err);
  }
}

async function bySemester(req: Request, res: Response, next: NextFunction) {
  try {
    const id = idSchema.parse({ params: req.params }).params;
    const semester = await prisma.semester.findUnique({ where: { id: id.id } });
    if (!semester) throw notFound('Semester not found.');
    const courses = await prisma.course.findMany({
      where: { status: 'ACTIVE' },
      include: {
        prerequisites: { include: { prerequisiteCourse: { select: { id: true, code: true } } } },
      },
      orderBy: { code: 'asc' },
    });
    res.json({ semester: { id: semester.id, code: semester.code, nameEn: semester.nameEn }, courses });
  } catch (err) {
    next(err);
  }
}

export default { list, getOne, bySemester };
