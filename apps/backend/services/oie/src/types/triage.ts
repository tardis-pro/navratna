import type { OIEEvent, OIESeverity } from './oie_event.js';

export type ErrorCategory =
  | 'transient'
  | 'defect'
  | 'capacity'
  | 'poison'
  | 'configuration'
  | 'dependency'
  | 'unknown';

export type TriageAction =
  | 'create_ticket'
  | 'alert'
  | 'retry_note'
  | 'dlq'
  | 'ignore';

export type TriageClassification = {
  category: ErrorCategory;
  severity: OIESeverity;
  action: TriageAction;
  reasoning: string;
};

export interface TriagedIncident {
  id: string;
  oieEventId: string;
  projectId: string;
  service: string;
  errorCode: string;
  message: string;
  classification: TriageClassification;
  occurrenceCount: number;
  occurrences1h: number;
  occurrences24h: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  isDuplicate: boolean;
  existingIncidentId?: string;
  sourceEvent: OIEEvent;
  triagedAt: Date;
}
