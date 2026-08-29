/**
 * Structured JSON logging for operational events.
 *
 * Rules (handoff §15):
 * - Never log access tokens, session tokens, API keys, or merchant secrets.
 * - Log operational facts, not merchant content. Product copy is merchant
 *   data and does not belong in logs.
 * - Errors are reduced to a message and name; stack traces stay server-side
 *   and are never returned to merchants.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVELS[(process.env.LOG_LEVEL as Level) || "info"] ?? LEVELS.info;

/** Keys that must never appear in a log line, whatever the caller passes. */
const REDACTED_KEYS =
  /^(accesstoken|access_token|token|apikey|api_key|apisecret|api_secret|secret|password|authorization|cookie|refreshtoken|refresh_token|ai_gateway_api_key)$/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.test(key) ? "[redacted]" : sanitize(val, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: Level, event: string, fields: Record<string, unknown> = {}) {
  if (LEVELS[level] < MIN_LEVEL) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(sanitize(fields) as Record<string, unknown>),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => emit("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
};

/**
 * Reduces any thrown value to a short, merchant-safe summary suitable for
 * persisting on AuditRun.errorMessage and showing in the UI. Deliberately
 * generic: it must not surface GraphQL internals, hostnames, or credentials.
 */
export function merchantSafeError(error: unknown): string {
  if (error instanceof Error && /GraphQL/i.test(error.message)) {
    return "Shopify rejected or throttled the product query. Please retry the scan.";
  }
  return "The scan could not be completed. Please retry, and contact support if this persists.";
}
