import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized, forbidden } from '../utils/apiError.js';
import type { Role } from '@prisma/client';

export function signAccessToken(payload: { sub: number; email: string; role: Role }): string {
  const options = { expiresIn: env.JWT_ACCESS_EXPIRES } as unknown as jwt.SignOptions;
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): { sub: number; email: string; role: Role } {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as { sub: number; email: string; role: Role };
}

/** Require a valid access token; attach the principal to req.auth. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return next(unauthorized());
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.sub, email: payload.email, role: payload.role };
    return next();
  } catch {
    return next(unauthorized('Invalid or expired access token'));
  }
}

/** Require one of the given roles (must run after authenticate). */
export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) return next(forbidden('Insufficient role permissions.'));
    return next();
  };
}

/** Ensure the authenticated student owns the given student id (or is staff). */
export function assertOwnsStudent(req: Request, studentId: number) {
  if (!req.auth) throw unauthorized();
  if (req.auth.role === 'ADMIN') return;
  if (req.auth.role === 'ADVISOR') return; // scoped deeper in services
  if (req.studentId !== undefined && req.studentId !== studentId) {
    throw forbidden('Students can only access their own records.');
  }
}
