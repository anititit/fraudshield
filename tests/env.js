// Loaded via jest "setupFiles" — runs before any module imports in tests
// For local testing: spin up PostgreSQL and set DATABASE_URL, or use Railway's test DB URL
process.env.DATABASE_URL = 'file:./prisma/test.db';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.REFRESH_TOKEN_EXPIRES_DAYS = '7';
process.env.NODE_ENV = 'test';
process.env.VELOCITY_WINDOW_MINUTES = '10';
process.env.VELOCITY_MAX_TRANSACTIONS = '3';
process.env.HIGH_RISK_COUNTRIES = 'KP,IR,SY,CU,SD,MM,BY,RU,VE,YE';
