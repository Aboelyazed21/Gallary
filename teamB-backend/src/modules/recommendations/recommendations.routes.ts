import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import * as eligibility from '../eligibility/eligibility.service.js';

/**
 * Academic recommendations: eligible courses ranked for the student.
 * Recommendations never bypass eligibility — only ELIGIBLE courses are
 * listed, ordered by level then code.
 */
async function recommend(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = z
      .object({
        query: z.object({
          semesterId: z.coerce.number().int().positive(),
          limit: z.coerce.number().int().min(1).max(20).default(8),
        }),
        params: z.object({ id: z.coerce.number().int().positive() }),
      })
      .parse({ query: req.query, params: req.params });
    const semesterId = parsed.query.semesterId;
    const limit = parsed.query.limit;
    const studentId = parsed.params.id;

    const semesterCourses = await (await import('../../lib/prisma.js')).prisma.course.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ level: 'asc' }, { code: 'asc' }],
    });
    const evaluated = [];
    for (const course of semesterCourses) {
      const result = await eligibility.checkEligibility(studentId, course.id, semesterId);
      evaluated.push({ course, result });
    }
    const eligible = evaluated
      .filter((e) => e.result.eligible && e.result.status === 'ELIGIBLE')
      .map((e) => ({
        courseId: e.course.id,
        code: e.course.code,
        titleEn: e.course.titleEn,
        creditHours: e.course.creditHours,
        level: e.course.level,
        reasons: e.result.reasons,
        recommendations: e.result.recommendations,
      }))
      .slice(0, limit);
    res.json(eligible);
  } catch (err) {
    next(err);
  }
}

export default { recommend };
