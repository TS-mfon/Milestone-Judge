type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const globalState = globalThis as typeof globalThis & {
  milestoneJudgeRateLimits?: Map<string, RateLimitEntry>;
};

const entries =
  globalState.milestoneJudgeRateLimits || new Map<string, RateLimitEntry>();
globalState.milestoneJudgeRateLimits = entries;

export function requestClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export function consumeRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
) {
  const now = Date.now();
  const current = entries.get(key);
  if (!current || current.resetAt <= now) {
    entries.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= options.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
