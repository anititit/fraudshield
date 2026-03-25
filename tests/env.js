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
// Rate limits — set very high so existing integration tests never hit them.
// The rateLimit.test.js file spins up its own minimal Express app with tight
// limits to test 429 behavior without affecting the shared app state.
process.env.RATE_LIMIT_AUTH_MAX               = '10000';
process.env.RATE_LIMIT_AUTH_WINDOW_MINUTES    = '60';
process.env.RATE_LIMIT_ANALYZE_MAX            = '10000';
process.env.RATE_LIMIT_ANALYZE_WINDOW_MINUTES = '60';
process.env.RATE_LIMIT_API_MAX                = '10000';
process.env.RATE_LIMIT_API_WINDOW_MINUTES     = '60';
