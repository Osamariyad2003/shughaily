import rateLimit from 'express-rate-limit';

/**
 * Throttles brute-force /auth/login attempts. Keyed by IP (express-rate-
 * limit's default) — good enough for a single-instance deployment; a
 * multi-instance deployment behind a load balancer would need a shared
 * store (e.g. Redis, already in this stack) instead of the in-memory
 * default so the limit is enforced across instances.
 *
 * skipSuccessfulRequests: only failed login attempts burn the budget, so
 * a legitimate user who mistypes their password once or twice isn't
 * locked out by their own eventual successful login.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: 'Too many login attempts. Please try again in a few minutes.',
  },
});

/**
 * Throttles /auth/register (and /auth/google as a new-account path).
 * Every attempt counts here, including successes — unlike login, a
 * "successful" registration is itself the abuse being defended against
 * (mass account creation, hashing-cost DoS via repeated bcrypt.hash calls).
 */
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many accounts created from this address. Please try again later.',
  },
});
