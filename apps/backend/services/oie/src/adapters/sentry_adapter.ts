import axios, { type AxiosInstance } from 'axios';
import { logger } from '@uaip/utils';
import type { ObservabilityAdapter } from '../types/observability_adapter.js';
import type { AdapterConfigSchema, AdapterCapability, AdapterHealth } from '../types/base_adapter.js';
import type { OIEError, OIEMetric, OIETrace, OIEIncident, QueryErrorsParams, QueryMetricsParams, QueryTracesParams, NewIncidentCallback } from '../types/observability_adapter.js';
import type { OIEEvent, OIESeverity } from '../types/oie_event.js';
import { randomUUID } from 'node:crypto';

const SENTRY_CONFIG_SCHEMA: AdapterConfigSchema = {
  fields: [
    { name: 'apiUrl', type: 'url', required: true, description: 'Sentry self-hosted API base URL', envVar: 'SENTRY_API_URL', defaultValue: 'http://localhost:9000' },
    { name: 'authToken', type: 'secret', required: true, description: 'Sentry auth token', envVar: 'SENTRY_AUTH_TOKEN' },
    { name: 'org', type: 'string', required: true, description: 'Sentry organization slug', envVar: 'SENTRY_ORG', defaultValue: 'sentry' },
    { name: 'project', type: 'string', required: true, description: 'Sentry project slug', envVar: 'SENTRY_PROJECT', defaultValue: 'navratna' },
  ],
  validate(config: Record<string, unknown>): void {
    if (!config['authToken']) {
      throw new Error('SentryAdapter: authToken is required');
    }
    if (!config['org']) {
      throw new Error('SentryAdapter: org is required');
    }
  },
};

const SENTRY_CAPABILITIES: AdapterCapability[] = [
  { type: 'query_errors', supportsRealtime: false, supportsHistorical: true, maxLookbackDays: 90 },
  { type: 'get_incidents', supportsRealtime: true, supportsHistorical: true, maxLookbackDays: 90 },
];

type SentryLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

function sentryLevelToSeverity(level: SentryLevel): OIESeverity {
  switch (level) {
    case 'fatal': return 'critical';
    case 'error': return 'high';
    case 'warning': return 'medium';
    default: return 'low';
  }
}

function isSentryIssue(issue: unknown): issue is {
  id: string;
  title: string;
  culprit: string;
  count: string;
  level: SentryLevel;
  firstSeen: string;
  lastSeen: string;
  isUnresolved: boolean;
  permalink?: string;
} {
  return typeof issue === 'object' && issue !== null && 'id' in issue && 'title' in issue && 'level' in issue;
}

export class SentryAdapter implements ObservabilityAdapter {
  readonly id = 'sentry';
  readonly type = 'observability';

  private http: AxiosInstance | null = null;
  private org = '';
  private project = '';
  private newIncidentCallbacks: NewIncidentCallback[] = [];

  getConfigSchema(): AdapterConfigSchema {
    return SENTRY_CONFIG_SCHEMA;
  }

  getCapabilities(): AdapterCapability[] {
    return SENTRY_CAPABILITIES;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    SENTRY_CONFIG_SCHEMA.validate(config);
    const apiUrl = String(config['apiUrl'] ?? process.env.SENTRY_API_URL ?? 'http://localhost:9000');
    const authToken = String(config['authToken'] ?? process.env.SENTRY_AUTH_TOKEN ?? '');
    this.org = String(config['org'] ?? process.env.SENTRY_ORG ?? 'sentry');
    this.project = String(config['project'] ?? process.env.SENTRY_PROJECT ?? 'navratna');

    this.http = axios.create({
      baseURL: `${apiUrl}/api/0`,
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });

    logger.info('SentryAdapter initialized', { apiUrl, org: this.org, project: this.project });
  }

  async healthCheck(): Promise<AdapterHealth> {
    const start = Date.now();
    try {
      await this.http?.get('/');
      return { healthy: true, latencyMs: Date.now() - start, checkedAt: new Date() };
    } catch (err) {
      return {
        healthy: false,
        error: err instanceof Error ? err.message : 'unknown',
        checkedAt: new Date(),
      };
    }
  }

  async shutdown(): Promise<void> {
    this.http = null;
    this.newIncidentCallbacks = [];
  }

  async queryErrors(params: QueryErrorsParams): Promise<OIEError[]> {
    if (!this.http) throw new Error('SentryAdapter not initialized');

    const query = [
      `is:unresolved`,
      `firstSeen:>${params.since.toISOString()}`,
      ...(params.service ? [`project:${params.service}`] : []),
    ].join(' ');

    try {
      const res = await this.http.get(`/projects/${this.org}/${this.project}/issues/`, {
        params: {
          query,
          limit: params.limit ?? 50,
          expand: ['owners'],
        },
      });

      const issues: unknown[] = res.data ?? [];
      return issues.filter(isSentryIssue).map((issue): OIEError => ({
        id: issue.id,
        errorCode: `SENTRY_${issue.culprit.replace(/[^A-Z0-9]/gi, '_').toUpperCase()}`,
        message: issue.title,
        service: this.project,
        count: parseInt(issue.count, 10),
        firstSeen: new Date(issue.firstSeen),
        lastSeen: new Date(issue.lastSeen),
        tags: { level: issue.level, permalink: issue.permalink ?? '' },
      }));
    } catch (err) {
      logger.warn('SentryAdapter.queryErrors failed', { error: err instanceof Error ? err.message : err });
      return [];
    }
  }

  async queryMetrics(_params: QueryMetricsParams): Promise<OIEMetric[]> {
    return [];
  }

  async queryTraces(_params: QueryTracesParams): Promise<OIETrace[]> {
    return [];
  }

  async getIncidents(since: Date): Promise<OIEIncident[]> {
    if (!this.http) return [];

    try {
      const res = await this.http.get(`/projects/${this.org}/${this.project}/issues/`, {
        params: {
          query: `is:unresolved firstSeen:>${since.toISOString()}`,
          limit: 100,
        },
      });

      const issues: unknown[] = res.data ?? [];
      return issues.filter(isSentryIssue).map((issue): OIEIncident => ({
        id: issue.id,
        title: issue.title,
        errorCode: `SENTRY_${issue.culprit.replace(/[^A-Z0-9]/gi, '_').toUpperCase()}`,
        service: this.project,
        severity: sentryLevelToSeverity(issue.level),
        count: parseInt(issue.count, 10),
        firstSeen: new Date(issue.firstSeen),
        lastSeen: new Date(issue.lastSeen),
        resolved: !issue.isUnresolved,
        permalink: issue.permalink,
      }));
    } catch (err) {
      logger.warn('SentryAdapter.getIncidents failed', { error: err instanceof Error ? err.message : err });
      return [];
    }
  }

  normalizeToOIEEvent(raw: OIEError | OIEIncident, projectId: string): OIEEvent {
    const isError = 'message' in raw && !('title' in raw);
    const message = isError ? (raw as OIEError).message : (raw as OIEIncident).title;
    const severity = isError
      ? (['critical', 'high', 'medium', 'low'] as OIESeverity[]).find(s => s === (raw as OIEError).tags?.['level']) ?? 'medium'
      : (raw as OIEIncident).severity;

    return {
      id: randomUUID(),
      projectId,
      source: 'sentry',
      eventType: 'error',
      severity,
      errorCode: raw.errorCode,
      service: raw.service,
      message,
      fingerprint: `sentry:${raw.service}:${raw.errorCode}`,
      timestamp: 'lastSeen' in raw ? new Date((raw as OIEError).lastSeen ?? (raw as OIEIncident).lastSeen) : new Date(),
      raw,
    };
  }

  onNewIncident(callback: NewIncidentCallback): void {
    this.newIncidentCallbacks.push(callback);
  }
}
