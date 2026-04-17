import type { BaseAdapter } from './base_adapter.js';
import type { OIEEvent, OIESeverity, StackFrame } from './oie_event.js';

export interface QueryErrorsParams {
  since: Date;
  until?: Date;
  service?: string;
  severity?: OIESeverity;
  limit?: number;
}

export interface QueryMetricsParams {
  metricName: string;
  since: Date;
  until?: Date;
  service?: string;
  step?: string;
}

export interface QueryTracesParams {
  traceId?: string;
  service?: string;
  since: Date;
  until?: Date;
  hasError?: boolean;
  limit?: number;
}

export interface OIEError {
  id: string;
  errorCode: string;
  message: string;
  service: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  stackTrace?: StackFrame[];
  tags?: Record<string, string>;
  traceId?: string;
}

export interface OIEMetric {
  name: string;
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
  unit?: string;
}

export interface OIETrace {
  traceId: string;
  service: string;
  operation: string;
  durationMs: number;
  hasError: boolean;
  spans: number;
  timestamp: Date;
}

export interface OIEIncident {
  id: string;
  title: string;
  errorCode: string;
  service: string;
  severity: OIESeverity;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  resolved: boolean;
  permalink?: string;
}

export type NewIncidentCallback = (incident: OIEIncident) => void | Promise<void>;

export interface ObservabilityAdapter extends BaseAdapter {
  queryErrors(params: QueryErrorsParams): Promise<OIEError[]>;
  queryMetrics(params: QueryMetricsParams): Promise<OIEMetric[]>;
  queryTraces(params: QueryTracesParams): Promise<OIETrace[]>;
  getIncidents(since: Date): Promise<OIEIncident[]>;
  normalizeToOIEEvent(raw: OIEError | OIEIncident, projectId: string): OIEEvent;
  onNewIncident?(callback: NewIncidentCallback): void;
}
