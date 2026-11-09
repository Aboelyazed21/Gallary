import { randomBytes, createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { signAccessToken } from '../../middlewares/auth.js';
import { prisma } from '../../lib/prisma.js';
import { badRequest, unauthorized, conflict } from '../../utils/apiError.js';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function register(
  input: { email: string; password: string; fullName: string; universityId: string },
  options: { actorRole?: string } = {},
) {
  const email = input.email.trim().toLowerCase();

  if (env.ALLOWED_EMAIL_DOMAIN && !email.endsWith(`@${env.ALLOWED_EMAIL_DOMAIN}`)) {
    throw badRequest('EMAIL_DOMAIN_NOT_ALLOWED', `Only @${env.ALLOWED_EMAIL_DOMAIN} email addresses are accepted.`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict('EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: { email, passwordHash, role: 'STUDENT' },
  });

  return user;
}

export async function login(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) throw unauthorized('Invalid credentials.');
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw unauthorized('Invalid credentials.');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });

  // Rotating refresh token (hashed at rest).
  const refreshRaw = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: sha256(refreshRaw), expiresAt },
  });

  return { accessToken, refreshToken: refreshRaw, user: { id: user.id, email: user.email, role: user.role } };
}

export async function refresh(refreshRaw: string) {
  const tokenHash = sha256(refreshRaw);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw unauthorized('Invalid or expired refresh token.');
  }
  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user || !user.isActive) throw unauthorized('Invalid or expired refresh token.');

  // Rotate: revoke old, issue new.
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  const newRaw = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: sha256(newRaw), expiresAt } });

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  return { accessToken, refreshToken: newRaw };
}

export async function logout(refreshRaw: string) {
  const tokenHash = sha256(refreshRaw);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (stored && !stored.revokedAt) {
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  }
}

export async function me(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { studentProfile: { include: { program: true } } },
  });
  if (!user) throw unauthorized();
  return user;
}
