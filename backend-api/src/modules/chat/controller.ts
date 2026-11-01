import { Request, Response } from 'express';
import { AppError } from '../../utils/errors';
import { asyncHandler } from '../../utils/async';
import { requireStudentByUserId } from '../../services/studentContext';
import { parseTerm } from '../../services/term';
import * as service from './service';

async function currentStudent(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return requireStudentByUserId(req.user.id);
}

export const createSession = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  res.status(201).json({ data: await service.createSession(student, req.body.title) });
});

export const listSessions = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  res.json({ data: await service.listSessions(student) });
});

export const getSession = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  res.json({ data: await service.getSession(student, req.params.id!) });
});

export const ask = asyncHandler(async (req: Request, res: Response) => {
  const student = await currentStudent(req);
  const result = await service.ask(
    student,
    req.params.id!,
    req.body.question,
    req.body.language ?? 'auto',
    parseTerm(req.body.term),
    req.user?.id ?? null,
  );
  res.json({ data: result });
});
