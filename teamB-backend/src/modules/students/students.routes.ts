import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import * as students from './students.service.js';
import { gpaReport } from './gpa.report.service.js';

const listQuery = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    programId: z.coerce.number().int().positive().optional(),
    search: z.string().min(1).optional(),
  }),
});

const idSchema = z.object({ params: z.object({ id: z.coerce.number().int().positive() }) });

async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const q = listQuery.parse({ query: req.query }).query;
    res.json(await students.listStudents(q));
  } catch (err) {
    next(err);
  }
}

async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = idSchema.parse({ params: req.params }).params;
    res.json(await students.getStudentById(id));
  } catch (err) {
    next(err);
  }
}

async function profile(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = idSchema.parse({ params: req.params }).params;
    const student = await students.getStudentById(id);
    res.json(student);
  } catch (err) {
    next(err);
  }
}

async function academicRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = idSchema.parse({ params: req.params }).params;
    res.json(await students.getAcademicSummary(id, req.auth!));
  } catch (err) {
    next(err);
  }
}

async function gpa(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = idSchema.parse({ params: req.params }).params;
    res.json(await gpaReport(id));
  } catch (err) {
    next(err);
  }
}

async function myProfile(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await students.getMyProfile(req.auth!));
  } catch (err) {
    next(err);
  }
}

export default { list, getOne, profile, academicRecords, gpa, myProfile };
