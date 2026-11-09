// Sets safe env defaults before any application module is imported (env.ts validates at load).

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'mysql://test:test@localhost:3306/smart_advisor_test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-0123456789abcdef';
process.env.ALLOWED_EMAIL_DOMAIN = 'bua.edu.eg';
process.env.CORS_ORIGINS = 'http://localhost:5173';
