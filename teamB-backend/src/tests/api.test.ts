import request from 'supertest';
import { buildApp } from '../app.js';
import { signAccessToken, verifyAccessToken } from '../middlewares/auth.js';
import { hashPassword, verifyPassword } from '../modules/auth/auth.service.js';

describe('health endpoints', () => {
  it('GET /health/live returns ok', async () => {
    const res = await request(buildApp()).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('authentication guard', () => {
  it('rejects requests without a token (401)', async () => {
    const res = await request(buildApp()).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects requests with an invalid token (401)', async () => {
    const res = await request(buildApp())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('rejects a wrong role (403) without touching the DB', async () => {
    const token = signAccessToken({ sub: 1, email: 's@bua.edu.eg', role: 'STUDENT' });
    const res = await request(buildApp())
      .get('/api/students?page=1&limit=5')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('password + token helpers', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('ChangeMe!2026');
    expect(hash).not.toBe('ChangeMe!2026');
    await expect(verifyPassword('ChangeMe!2026', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });

  it('round-trips the access token payload', async () => {
    const token = signAccessToken({ sub: 7, email: 'a@bua.edu.eg', role: 'ADMIN' as never });
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe(7);
    expect(decoded.email).toBe('a@bua.edu.eg');
    expect(decoded.role).toBe('ADMIN');
  });
});

describe('validation', () => {
  it('login with a malformed body returns 400', async () => {
    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('registration rejects short passwords (400)', async () => {
    const res = await request(buildApp())
      .post('/api/auth/register')
      .send({ email: 'x@bua.edu.eg', password: 'short', fullName: 'X', universityId: '1234' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
