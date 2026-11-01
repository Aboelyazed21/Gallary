import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { chatLimiter } from '../../middlewares/rateLimit';
import * as controller from './controller';
import { createSessionSchema, messageSchema, sessionIdParamSchema } from './schema';

export const chatRouter = Router();

chatRouter.use(requireAuth, requireRole('student'));
chatRouter.post('/sessions', validate({ body: createSessionSchema }), controller.createSession);
chatRouter.get('/sessions', controller.listSessions);
chatRouter.get('/sessions/:id', validate({ params: sessionIdParamSchema }), controller.getSession);
chatRouter.post(
  '/sessions/:id/messages',
  chatLimiter,
  validate({ params: sessionIdParamSchema, body: messageSchema }),
  controller.ask,
);
