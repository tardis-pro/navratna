export const STALE_TIMES = {
  REALTIME: 0,
  FAST: 15_000,
  DEFAULT: 30_000,
  SLOW: 60_000,
  STATIC: 5 * 60 * 1000,
} as const;

export const REFETCH_INTERVALS = {
  FAST: 15_000,
  DEFAULT: 30_000,
  SLOW: 60_000,
} as const;
