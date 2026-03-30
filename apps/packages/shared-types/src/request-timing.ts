export interface RequestTimingStats {
  p95: number;
  p50: number;
  avg: number;
  count: number;
}

export interface TimingStore {
  requestStart?: number;
}
