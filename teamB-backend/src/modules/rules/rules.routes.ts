import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import * as rules from './rules.service.js';

const upsertSchema = z.object({
  body: z.object({
    key: z.string().min(1).max(80),
    category: z.string().min(1).max(60),
    titleEn: z.string().min(1).max(240),
    descriptionEn: z.string().max(4000).optional(),
    value: z.any(),
    sourceRef: z.string().max(240).optional(),
    requiresConfirmation: z.boolean().optional(),
  }),
});

async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const activeOnly = (req.query.active as string | undefined) !== 'false';
    res.json(await rules.listRules(activeOnly));
  } catch (err) {
    next(err);
  }
}

async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const id = z.object({ params: z.object({ id: z.coerce.number().int().positive() }) })
      .parse({ params: req.params }).params.id;
    res.json(await rules.getRuleById(id));
  } catch (err) {
    next(err);
  }
}

async function upsert(req: Request, res: Response, next: NextFunction) {
  try {
    const body = upsertSchema.parse({ body: req.body }).body;
    const rule = await rules.upsertRule({ ...body, value: body.value as unknown, approvedById: req.auth?.userId });
    res.status(201).json(rule);
  } catch (err) {
    next(err);
  }
}

export default { list, getOne, upsert };
