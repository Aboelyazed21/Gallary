import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import * as eligibility from './eligibility.service.js';

const checkSchema = z.object({
  body: z.object({
    studentId: z.coerce.number().int().positive(),
    courseId: z.coerce.number().int().positive(),
    semesterId: z.coerce.number().int().positive(),
  }),
});

const bulkSchema = z.object({
  body: z.object({
    studentId: z.coerce.number().int().positive(),
    courseIds: z.array(z.coerce.number().int().positive()).min(1).max(50),
    semesterId: z.coerce.number().int().positive(),
  }),
});

async function check(req: Request, res: Response, next: NextFunction) {
  try {
    const { studentId, courseId, semesterId } = checkSchema.parse({ body: req.body }).body;
    res.json(await eligibility.checkEligibility(studentId, courseId, semesterId));
  } catch (err) {
    next(err);
  }
}

async function checkBulk(req: Request, res: Response, next: NextFunction) {
  try {
    const { studentId, courseIds, semesterId } = bulkSchema.parse({ body: req.body }).body;
    res.json(await eligibility.checkEligibilityBulk(studentId, courseIds, semesterId));
  } catch (err) {
    next(err);
  }
}

export default { check, checkBulk };
