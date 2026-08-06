export const STALE_TIMES = {
  REALTIME: 0,
  FAST: 60_000,
  DEFAULT: 120_000,
  SLOW: 300_000,
  STATIC: 15 * 60 * 1000,
} as const;

export const REFETCH_INTERVALS = {
  FAST: 60_000,
  DEFAULT: 120_000,
  SLOW: 300_000,
} as const;
