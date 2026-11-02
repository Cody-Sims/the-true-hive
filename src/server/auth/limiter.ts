import { AdminAuthError } from "./service.ts";

// Process-wide budgets intentionally do not derive identity from proxy headers.
export function createAttemptLimiter(
  limit = 60,
  windowMs = 60000,
  now = Date.now,
) {
  let start = now();
  let attempts = 0;
  return {
    consume() {
      const time = now();
      if (time - start >= windowMs) {
        start = time;
        attempts = 0;
      }
      if (++attempts > limit) throw new AdminAuthError(429, "RATE_LIMITED");
    },
  };
}
