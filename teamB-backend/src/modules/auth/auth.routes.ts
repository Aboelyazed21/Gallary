import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import * as authService from './auth.service.js';
import { authRateLimit } from '../../middlewares/rateLimit.js';

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    fullName: z.string().min(1, 'Full name is required').max(200),
    universityId: z.string().min(4, 'University ID is required').max(32),
  }),
});

const refreshSchema = z.object({
  body: z.object({ refreshToken: z.string().min(1) }),
});

async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = loginSchema.parse({ body: req.body }).body;
    const result = await authService.login(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const body = registerSchema.parse({ body: req.body }).body;
    const user = await authService.register(body);
    res.status(201).json({ id: user.id, email: user.email, role: user.role, createdAt: user.createdAt });
  } catch (err) {
    next(err);
  }
}

async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = refreshSchema.parse({ body: req.body }).body;
    const result = await authService.refresh(refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
    if (typeof refreshToken === 'string' && refreshToken.length > 0) {
      await authService.logout(refreshToken);
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.me(req.auth!.userId);
    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      student: user.studentProfile
        ? {
            id: user.studentProfile.id,
            universityId: user.studentProfile.universityId,
            fullName: user.studentProfile.fullName,
            program: user.studentProfile.program,
            level: user.studentProfile.level,
            status: user.studentProfile.status,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
}

export default { login, register, refresh, logout, me, authRateLimit };
