import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notFound, conflict, badRequest } from '../../utils/apiError.js';

const createStudentSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    fullName: z.string().min(1).max(200),
    universityId: z.string().min(4).max(32),
    programId: z.coerce.number().int().positive(),
    level: z.coerce.number().int().min(1).max(10).default(1),
    advisorId: z.coerce.number().int().positive().optional(),
  }),
});

async function importStudents(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = req.body as { rows?: Array<Record<string, string>> };
    if (!Array.isArray(rows) || rows.length === 0) {
      throw badRequest('EMPTY_IMPORT', 'No rows provided.');
    }
    if (rows.length > 500) throw badRequest('IMPORT_TOO_LARGE', 'Maximum 500 rows per import.');

    const report = { received: rows.length, created: 0, duplicates: 0, errors: [] as Array<{ index: number; error: string }> };
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const body = createStudentSchema.parse({
          body: {
            email: row.email,
            password: row.password || process.env.DEMO_PASSWORD || 'ChangeMe!2026',
            fullName: row.fullName,
            universityId: row.universityId,
            programId: Number(row.programId),
            level: Number(row.level || 1),
          },
        }).body;

        const existingUser = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
        const existingStudent = await prisma.student.findUnique({ where: { universityId: body.universityId } });
        if (existingUser || existingStudent) {
          report.duplicates += 1;
          continue;
        }
        const bcrypt = await import('bcryptjs');
        const hash = await bcrypt.hash(body.password, 10);
        await prisma.user.create({
          data: {
            email: body.email.toLowerCase(),
            passwordHash: hash,
            role: 'STUDENT',
            studentProfile: {
              create: {
                universityId: body.universityId,
                fullName: body.fullName,
                programId: body.programId,
                level: body.level,
              },
            },
          },
        });
        report.created += 1;
      } catch (err) {
        report.errors.push({ index: i, error: err instanceof Error ? err.message : 'Invalid row.' });
      }
    }
    await prisma.auditLog.create({
      data: { actorId: req.auth!.userId, action: 'CSV_STUDENT_IMPORT', entity: 'Student', payload: report },
    });
    res.status(201).json(report);
  } catch (err) {
    next(err);
  }
}

async function reassignAdvisor(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = z.object({ params: z.object({ id: z.coerce.number().int().positive() }) })
      .parse({ params: req.params }).params;
    const { advisorId } = z.object({ body: z.object({ advisorId: z.coerce.number().int().positive() }) })
      .parse({ body: req.body }).body;
    const student = await prisma.student.findUnique({ where: { id } });
    if (!student) throw notFound('Student not found.');
    const advisor = await prisma.user.findUnique({ where: { id: advisorId } });
    if (!advisor || advisor.role !== 'ADVISOR') throw badRequest('INVALID_ADVISOR', 'Advisor user not found.');
    const updated = await prisma.student.update({ where: { id }, data: { advisorId } });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function auditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const [total, rows] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    ]);
    res.json({ total, rows, page, limit });
  } catch (err) {
    next(err);
  }
}

export default { importStudents, reassignAdvisor, auditLogs };
