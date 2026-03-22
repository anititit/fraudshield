// Loaded via jest "setupFiles" — runs before any module imports in tests
process.env.DATABASE_URL = 'file:./prisma/test.db';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.REFRESH_TOKEN_EXPIRES_DAYS = '7';
process.env.NODE_ENV = 'test';
