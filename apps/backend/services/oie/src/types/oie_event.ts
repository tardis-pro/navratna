export type OIESource = 'signoz' | 'sentry' | 'prometheus' | 'manual';

export type OIESeverity = 'low' | 'medium' | 'high' | 'critical';

export type OIEEventType =
  | 'error'
  | 'metric_threshold'
  | 'trace_anomaly'
  | 'incident'
  | 'health_degradation';

export interface StackFrame {
  filename: string;
  function: string;
  lineno?: number;
  colno?: number;
  context?: string;
}

export interface OIEEvent {
  id: string;
  projectId: string;
  source: OIESource;
  eventType: OIEEventType;
  severity: OIESeverity;
  errorCode: string;
  service: string;
  message: string;
  stackTrace?: StackFrame[];
  metrics?: Record<string, number>;
  traceId?: string;
  spanId?: string;
  fingerprint: string;
  timestamp: Date;
  raw: unknown;
}
