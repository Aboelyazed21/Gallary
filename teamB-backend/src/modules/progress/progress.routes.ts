import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import * as progress from './progress.service.js';

async function getForStudent(req: Request, res: Response, next: NextFunction) {
  try {
    const id = z.object({ params: z.object({ id: z.coerce.number().int().positive() }) })
      .parse({ params: req.params }).params.id;
    res.json(await progress.degreeProgress(id));
  } catch (err) {
    next(err);
  }
}

export default { getForStudent };
