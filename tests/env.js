// Loaded via jest "setupFiles" — runs before any module imports in tests
// For local testing: spin up PostgreSQL and set DATABASE_URL, or use Railway's test DB URL
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/fraudshield_test';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.REFRESH_TOKEN_EXPIRES_DAYS = '7';
process.env.NODE_ENV = 'test';
