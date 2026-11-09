import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env, corsOrigins } from './config/env.js';
import { authenticate, authorize } from './middlewares/auth.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { apiRateLimit, authRateLimit } from './middlewares/rateLimit.js';
import { notFound } from './utils/apiError.js';
import { openapiSpec } from './docs/openapi.js';

import authRoutes from './modules/auth/auth.routes.js';
import studentsRoutes from './modules/students/students.routes.js';
import coursesRoutes from './modules/courses/courses.routes.js';
import semestersRoutes from './modules/semesters/semesters.routes.js';
import rulesRoutes from './modules/rules/rules.routes.js';
import eligibilityRoutes from './modules/eligibility/eligibility.routes.js';
import registrationsRoutes from './modules/registrations/registrations.routes.js';
import progressRoutes from './modules/progress/progress.routes.js';
import recommendationsRoutes from './modules/recommendations/recommendations.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import * as students from './modules/students/students.service.js';
import { middleware as studentIdentity } from './modules/students/studentIdentity.js';

export function buildApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.NODE_ENV === 'production' ? 'loopback' : false);
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(morgan(env.LOG_LEVEL));
  app.use(express.json({ limit: '100kb' }));

  // health (public)
  app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', async (_req, res) => {
    const checks: Record<string, { ok: boolean; detail?: string }> = { database: { ok: false } };
    try {
      const { prisma } = await import('./lib/prisma.js');
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { ok: true };
    } catch (error) {
      checks.database = { ok: false, detail: error instanceof Error ? error.message : undefined };
    }
    const allOk = Object.values(checks).every((c) => c.ok);
    res.status(allOk ? 200 : 503).json({ status: allOk ? 'ok' : 'error', checks });
  });

  // API docs (public in development, still serves locally — disable outside dev via env)
  if (env.NODE_ENV !== 'production') {
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, { explorer: true }));
  }

  const api = express.Router();
  app.use('/api', api);
  api.use(apiRateLimit);

  // ---- public auth endpoints (rate-limited) ----
  api.post('/auth/login', authRateLimit, authRoutes.login);
  api.post('/auth/register', authRateLimit, authRoutes.register);
  api.post('/auth/refresh', authRateLimit, authRoutes.refresh);
  api.post('/auth/logout', authRateLimit, authRoutes.logout);

  // ---- everything below requires auth ----
  api.use(authenticate);
  api.use(studentIdentity); // populates req.studentId for STUDENT role

  api.get('/auth/me', authRoutes.me);

  // Students
  api.get('/students', authorize('ADMIN', 'ADVISOR'), studentsRoutes.list);
  api.get('/students/:id', authorize('ADMIN', 'ADVISOR'), studentsRoutes.getOne);
  api.get('/students/:id/profile', authorize('ADMIN', 'ADVISOR', 'STUDENT'), studentsRoutes.profile);
  api.get('/students/:id/academic-records', authorize('ADMIN', 'ADVISOR', 'STUDENT'), studentsRoutes.academicRecords);
  api.get('/students/:id/gpa', authorize('ADMIN', 'ADVISOR', 'STUDENT'), studentsRoutes.gpa);
  api.get('/students/:id/gpa/history', authorize('ADMIN', 'ADVISOR', 'STUDENT'), studentsRoutes.gpa);
  api.get('/students/:id/progress', authorize('ADMIN', 'ADVISOR', 'STUDENT'), progressRoutes.getForStudent);
  api.get('/students/:id/registrations', authorize('ADMIN', 'ADVISOR', 'STUDENT'), registrationsRoutes.listForStudent);
  api.get('/students/:id/recommendations', authorize('ADMIN', 'ADVISOR', 'STUDENT'), recommendationsRoutes.recommend);
  api.get('/me/student', authorize('STUDENT'), studentsRoutes.myProfile);

  // Courses & semesters
  api.get('/courses', authorize('ADMIN', 'ADVISOR', 'STUDENT'), coursesRoutes.list);
  api.get('/courses/:id', authorize('ADMIN', 'ADVISOR', 'STUDENT'), coursesRoutes.getOne);
  api.get('/semesters', authorize('ADMIN', 'ADVISOR', 'STUDENT'), semestersRoutes.list);
  api.get('/semesters/:id', authorize('ADMIN', 'ADVISOR', 'STUDENT'), semestersRoutes.getOne);
  api.get('/semesters/:id/courses', authorize('ADMIN', 'ADVISOR', 'STUDENT'), coursesRoutes.bySemester);

  // Eligibility + registrations
  api.post('/eligibility/check', authorize('ADMIN', 'ADVISOR', 'STUDENT'), eligibilityRoutes.check);
  api.post('/eligibility/check-bulk', authorize('ADMIN', 'ADVISOR', 'STUDENT'), eligibilityRoutes.checkBulk);
  api.post('/registrations', authorize('ADMIN', 'ADVISOR', 'STUDENT'), registrationsRoutes.create);

  // Academic rules (read: staff; write: admin)
  api.get('/academic-rules', authorize('ADMIN', 'ADVISOR'), rulesRoutes.list);
  api.get('/academic-rules/:id', authorize('ADMIN', 'ADVISOR'), rulesRoutes.getOne);
  api.post('/academic-rules', authorize('ADMIN'), rulesRoutes.upsert);

  // Admin
  api.post('/admin/students/import', authorize('ADMIN'), adminRoutes.importStudents);
  api.patch('/admin/students/:id/advisor', authorize('ADMIN'), adminRoutes.reassignAdvisor);
  api.get('/admin/audit-logs', authorize('ADMIN'), adminRoutes.auditLogs);

  // 404 & error handling
  app.use((_req, _res, next) => next(notFound('Route not found.')));
  app.use(errorHandler);

  return app;
}
