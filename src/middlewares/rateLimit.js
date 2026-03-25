/**
 * Rate limiting middleware — protects all API surfaces.
 *
 * Three tiers:
 *   authLimiter    — brute-force protection on auth endpoints (keyed by IP)
 *   analyzeLimiter — tight limit on the expensive POST /fraud/analyze (keyed by user)
 *   apiLimiter     — general limit on read endpoints (keyed by user)
 *
 * All limits are configurable via environment variables so Railway / tests
 * can override them without code changes.
 */

const rateLimit = require('express-rate-limit');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Use authenticated user ID when available, fall back to IP. */
function userOrIpKey(req) {
  return req.user?.sub ?? req.ip;
}

/** Consistent 429 JSON body. */
function onLimitReached(req, res, _next, options) {
  const retryAfterSec = Math.ceil(options.windowMs / 1000);
  res.status(429).json({
    error: 'TOO_MANY_REQUESTS',
    message: `Rate limit exceeded. Try again in ${retryAfterSec} seconds.`,
    retryAfter: retryAfterSec,
  });
}

// ─── Limiters ─────────────────────────────────────────────────────────────────

/**
 * Auth limiter — keyed by IP.
 * Defends against credential stuffing and registration spam.
 * Default: 10 requests / 15 min.
 */
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MINUTES ?? '15', 10) * 60_000,
  max:      parseInt(process.env.RATE_LIMIT_AUTH_MAX           ?? '10', 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: onLimitReached,
});

/**
 * Analyze limiter — keyed by authenticated user ID.
 * Each user may submit at most N fraud-analysis requests per hour.
 * Default: 60 requests / 60 min (≈ 1/min sustained).
 */
const analyzeLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_ANALYZE_WINDOW_MINUTES ?? '60', 10) * 60_000,
  max:      parseInt(process.env.RATE_LIMIT_ANALYZE_MAX           ?? '60', 10),
  keyGenerator: userOrIpKey,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: onLimitReached,
});

/**
 * General API limiter — keyed by authenticated user ID.
 * Covers read endpoints (reports, dashboard).
 * Default: 200 requests / 60 min.
 */
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_API_WINDOW_MINUTES ?? '60', 10) * 60_000,
  max:      parseInt(process.env.RATE_LIMIT_API_MAX           ?? '200', 10),
  keyGenerator: userOrIpKey,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: onLimitReached,
});

module.exports = { authLimiter, analyzeLimiter, apiLimiter };
