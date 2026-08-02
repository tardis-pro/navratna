const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * BullMQ repeat intervals are milliseconds. `Number.parseInt('15m', 10)` yields
 * 15 — a 15 MILLISECOND repeat, which floods Redis and the tool executor. The
 * unit suffix must be read, and anything under the floor is rejected outright.
 */
const MIN_INTERVAL_MS = 1_000;

const INTERVAL_PATTERN = /^(\d+)(ms|s|m|h|d)?$/;

export function parseIntervalExpression(expression: string): number | null {
  const match = INTERVAL_PATTERN.exec(expression.trim());
  if (!match) return null;

  const amount = Number.parseInt(match[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = match[2] ?? 'ms';
  const totalMs = amount * UNIT_MS[unit];

  return totalMs >= MIN_INTERVAL_MS ? totalMs : null;
}
