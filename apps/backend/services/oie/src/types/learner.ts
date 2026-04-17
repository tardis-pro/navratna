export type OutcomeResult = 'resolved' | 'regressed' | 'no_change' | 'pending';

export interface IncidentOutcome {
  incidentId: string;
  errorCode: string;
  service: string;
  rootCauseSummary: string;
  fixDiffHash?: string;
  outcome: OutcomeResult;
  latencyDeltaMs?: number;
  errorRateDelta?: number;
  projectId: string;
  createdAt: Date;
}

export interface SLOConfig {
  projectId: string;
  targetErrorRatePct: number;
  targetP99LatencyMs: number;
  maxDlqAgeHours: number;
  maxCriticalUnresolved: number;
  updatedAt: Date;
}

export interface DriftVector {
  projectId: string;
  errorRateDrift: number;
  latencyDrift: number;
  dlqDepthDrift: number;
  unresolvedCriticalCount: number;
  overallDriftScore: number;
  detectedAt: Date;
}
