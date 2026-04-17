import type { OIEEvent, OIESeverity, OIEEventType } from '../types/oie_event.js';
import type { ErrorCategory, TriageAction, TriageClassification } from '../types/triage.js';

type OccurrenceCounts = { count1h: number; count24h: number };

const ESCALATION_1H = parseInt(process.env.OIE_SEVERITY_ESCALATION_1H ?? '10', 10);
const ESCALATION_24H = parseInt(process.env.OIE_SEVERITY_ESCALATION_24H ?? '50', 10);

const TRANSIENT_PATTERNS: RegExp[] = [
  /ECONNREFUSED/,
  /ETIMEDOUT/,
  /ENOTFOUND/,
  /ConnectionRefused/i,
  /socket hang up/i,
  /request timeout/i,
  /ECONNRESET/,
];

const POISON_PATTERNS: RegExp[] = [
  /validation[_ ]error/i,
  /invalid[_ ]input/i,
  /SyntaxError/,
  /JSON.parse/,
  /schema[_ ]validation/i,
  /unprocessable/i,
];

const CAPACITY_PATTERNS: RegExp[] = [
  /out of memory/i,
  /heap[_ ]limit/i,
  /cannot allocate/i,
  /ENOMEM/,
  /connection pool/i,
  /rate limit/i,
  /too many requests/i,
];

function matchesAny(message: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(message));
}

function classifyCategory(event: OIEEvent): ErrorCategory {
  const msg = event.message;
  if (matchesAny(msg, POISON_PATTERNS)) return 'poison';
  if (matchesAny(msg, CAPACITY_PATTERNS)) return 'capacity';
  if (matchesAny(msg, TRANSIENT_PATTERNS)) return 'transient';
  if (event.eventType === 'error') return 'defect';
  if (event.eventType === 'metric_threshold') return 'capacity';
  if (event.eventType === 'health_degradation') return 'dependency';
  return 'unknown';
}

function deriveSeverity(base: OIESeverity, counts: OccurrenceCounts): OIESeverity {
  if (base === 'critical') return 'critical';
  if (counts.count24h >= ESCALATION_24H) return 'high';
  if (counts.count1h >= ESCALATION_1H) return 'medium';
  return base;
}

function routeToAction(category: ErrorCategory, severity: OIESeverity): TriageAction {
  if (category === 'transient') return 'retry_note';
  if (category === 'poison') return 'dlq';
  if (category === 'capacity' && (severity === 'high' || severity === 'critical')) return 'alert';
  if (severity === 'critical' || severity === 'high') return 'create_ticket';
  if (category === 'defect') return 'create_ticket';
  if (category === 'dependency') return 'alert';
  return 'ignore';
}

export function classifyEvent(event: OIEEvent, counts: OccurrenceCounts): TriageClassification {
  const category = classifyCategory(event);
  const severity = deriveSeverity(event.severity, counts);
  const action = routeToAction(category, severity);

  const reasoning = buildReasoning(category, severity, action, counts);

  return { category, severity, action, reasoning };
}

function buildReasoning(
  category: ErrorCategory,
  severity: OIESeverity,
  action: TriageAction,
  counts: OccurrenceCounts,
): string {
  const parts: string[] = [`category=${category}`, `severity=${severity}`, `1h=${counts.count1h}`, `24h=${counts.count24h}`];
  switch (action) {
    case 'create_ticket': return `${parts.join(' ')} → auto-create Jira ticket`;
    case 'alert': return `${parts.join(' ')} → capacity/dependency alert`;
    case 'retry_note': return `${parts.join(' ')} → transient error, retry_note attached`;
    case 'dlq': return `${parts.join(' ')} → poison payload, route to DLQ`;
    case 'ignore': return `${parts.join(' ')} → below threshold, ignored`;
  }
}
