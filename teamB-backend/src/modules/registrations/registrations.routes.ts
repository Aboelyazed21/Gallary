import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import * as eligibility from '../eligibility/eligibility.service.js';

const regSchema = z.object({
  body: z.object({
    studentId: z.coerce.number().int().positive(),
    courseId: z.coerce.number().int().positive(),
    semesterId: z.coerce.number().int().positive(),
  }),
});

async function listForStudent(req: Request, res: Response, next: NextFunction) {
  try {
    const id = z.object({ params: z.object({ id: z.coerce.number().int().positive() }) })
      .parse({ params: req.params }).params.id;
    const rows = await prisma.courseRegistration.findMany({
      where: { studentId: id },
      include: {
        course: { select: { id: true, code: true, titleEn: true, creditHours: true } },
        semester: { select: { id: true, code: true, nameEn: true } },
      },
      orderBy: { registeredAt: 'desc' },
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const { studentId, courseId, semesterId } = regSchema.parse({ body: req.body }).body;
    const registration = await eligibility.registerStudent(studentId, courseId, semesterId);
    res.status(201).json(registration);
  } catch (err) {
    next(err);
  }
}

export default { listForStudent, create };
