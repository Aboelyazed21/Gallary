import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

/** Tiny in-memory fixed-window rate limiter (per client IP). */
function limiter(max: number) {
  const windowMs = env.RATE_LIMIT_WINDOW_MS;
  const hits = new Map<string, { count: number; reset: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
      });
    }
    return next();
  };
}

export const apiRateLimit = limiter(env.RATE_LIMIT_MAX);
export const authRateLimit = limiter(env.AUTH_RATE_LIMIT_MAX);
