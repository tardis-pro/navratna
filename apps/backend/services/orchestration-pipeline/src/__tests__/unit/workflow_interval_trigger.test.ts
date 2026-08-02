import { describe, it, expect } from 'vitest';

import { parseIntervalExpression } from '../../services/interval_expression.js';

describe('parseIntervalExpression', () => {
  it('reads the unit suffix instead of truncating it (15m is 15 minutes, not 15ms)', () => {
    expect(parseIntervalExpression('15m')).toBe(15 * 60_000);
    expect(parseIntervalExpression('30s')).toBe(30_000);
    expect(parseIntervalExpression('2h')).toBe(2 * 3_600_000);
    expect(parseIntervalExpression('1d')).toBe(86_400_000);
  });

  it('treats a bare number as milliseconds for backwards compatibility', () => {
    expect(parseIntervalExpression('900000')).toBe(900_000);
  });

  it('rejects an interval below the floor that would flood the queue', () => {
    expect(parseIntervalExpression('1ms')).toBeNull();
    expect(parseIntervalExpression('15')).toBeNull();
    expect(parseIntervalExpression('0s')).toBeNull();
  });

  it('rejects malformed expressions rather than silently coercing them', () => {
    expect(parseIntervalExpression('every 15 minutes')).toBeNull();
    expect(parseIntervalExpression('')).toBeNull();
    expect(parseIntervalExpression('-5m')).toBeNull();
    expect(parseIntervalExpression('15x')).toBeNull();
  });
});
