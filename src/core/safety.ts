export const SENSITIVE_KEY_PATTERN = /access.?token|refresh.?token|password|secret|private.?key|authorization|cookie|session.?token/i;

export function scrubSensitiveValue(value: unknown, key = "", depth = 0): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return undefined;
  if (depth > 8) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => scrubSensitiveValue(item, "", depth + 1)).filter((item) => item !== undefined);
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 100).map(([childKey, child]) => [childKey, scrubSensitiveValue(child, childKey, depth + 1)]).filter(([, child]) => child !== undefined));
  if (typeof value === "string") return value.slice(0, 20_000);
  return value;
}

export function containsSensitiveKey(value: unknown, depth = 0): boolean {
  if (depth > 8 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => containsSensitiveKey(item, depth + 1));
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => SENSITIVE_KEY_PATTERN.test(key) || containsSensitiveKey(child, depth + 1));
}
