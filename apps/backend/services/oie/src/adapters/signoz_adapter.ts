import axios, { type AxiosInstance } from 'axios';
import { logger } from '@uaip/utils';
import type { ObservabilityAdapter } from '../types/observability_adapter.js';
import type { AdapterConfigSchema, AdapterCapability, AdapterHealth } from '../types/base_adapter.js';
import type { OIEError, OIEMetric, OIETrace, OIEIncident, QueryErrorsParams, QueryMetricsParams, QueryTracesParams } from '../types/observability_adapter.js';
import type { OIEEvent, OIESeverity, StackFrame } from '../types/oie_event.js';
import { randomUUID } from 'node:crypto';

const SIGNOZ_CONFIG_SCHEMA: AdapterConfigSchema = {
  fields: [
    { name: 'apiUrl', type: 'url', required: true, description: 'SigNoz query-service URL', envVar: 'SIGNOZ_API_URL', defaultValue: 'http://localhost:8080' },
    { name: 'apiKey', type: 'secret', required: false, description: 'SigNoz API key', envVar: 'SIGNOZ_API_KEY' },
  ],
  validate(config: Record<string, unknown>): void {
    if (!config['apiUrl'] || typeof config['apiUrl'] !== 'string') {
      throw new Error('SigNozAdapter: apiUrl is required');
    }
  },
};

const SIGNOZ_CAPABILITIES: AdapterCapability[] = [
  { type: 'query_errors', supportsRealtime: false, supportsHistorical: true, maxLookbackDays: 30 },
  { type: 'query_metrics', supportsRealtime: false, supportsHistorical: true, maxLookbackDays: 30 },
  { type: 'query_traces', supportsRealtime: false, supportsHistorical: true, maxLookbackDays: 7 },
];

function isSignozErrorRow(row: unknown): row is { error_message: string; service_name: string; timestamp: string; trace_id?: string; count?: number } {
  return typeof row === 'object' && row !== null && 'error_message' in row && 'service_name' in row;
}

function toSeverity(count: number): OIESeverity {
  if (count > 100) return 'critical';
  if (count > 50) return 'high';
  if (count > 10) return 'medium';
  return 'low';
}

export class SigNozAdapter implements ObservabilityAdapter {
  readonly id = 'signoz';
  readonly type = 'observability';

  private http: AxiosInstance | null = null;
  private apiUrl = '';
  private apiKey = '';

  getConfigSchema(): AdapterConfigSchema {
    return SIGNOZ_CONFIG_SCHEMA;
  }

  getCapabilities(): AdapterCapability[] {
    return SIGNOZ_CAPABILITIES;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    SIGNOZ_CONFIG_SCHEMA.validate(config);
    this.apiUrl = String(config['apiUrl'] ?? process.env.SIGNOZ_API_URL ?? 'http://localhost:8080');
    this.apiKey = String(config['apiKey'] ?? process.env.SIGNOZ_API_KEY ?? '');

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['SIGNOZ-API-KEY'] = this.apiKey;
    }

    this.http = axios.create({ baseURL: this.apiUrl, headers, timeout: 30_000 });
    logger.info('SigNozAdapter initialized', { apiUrl: this.apiUrl, hasApiKey: !!this.apiKey });
  }

  async healthCheck(): Promise<AdapterHealth> {
    const start = Date.now();
    try {
      await this.http?.get('/api/v1/health');
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
  }

  async queryErrors(params: QueryErrorsParams): Promise<OIEError[]> {
    if (!this.http) throw new Error('SigNozAdapter not initialized');
    const start = Math.floor(params.since.getTime() / 1000);
    const end = params.until ? Math.floor(params.until.getTime() / 1000) : Math.floor(Date.now() / 1000);

    const query = {
      start,
      end,
      step: 60,
      variables: {},
      compositeQuery: {
        queryType: 'builder',
        panelType: 'table',
        builderQueries: {
          A: {
            dataSource: 'logs',
            queryName: 'A',
            expression: 'A',
            filters: {
              items: [
                { key: { key: 'level', dataType: 'string', type: 'tag' }, op: 'in', value: ['error', 'fatal'] },
                ...(params.service ? [{ key: { key: 'service.name', dataType: 'string', type: 'resource' }, op: 'contains', value: params.service }] : []),
              ],
              op: 'AND',
            },
            aggregateOperator: 'count',
            groupBy: [
              { key: 'body', dataType: 'string', type: 'tag' },
              { key: 'service.name', dataType: 'string', type: 'resource' },
            ],
            limit: params.limit ?? 50,
          },
        },
      },
    };

    try {
      const res = await this.http.post('/api/v5/query_range', query);
      const rows: unknown[] = res.data?.data?.result ?? [];
      return rows.filter(isSignozErrorRow).map((row): OIEError => ({
        id: randomUUID(),
        errorCode: `SIGNOZ_${String(row.service_name).toUpperCase().replace(/[^A-Z0-9]/g, '_')}_ERROR`,
        message: String(row.error_message).slice(0, 500),
        service: String(row.service_name),
        count: Number(row.count ?? 1),
        firstSeen: new Date(start * 1000),
        lastSeen: new Date(Number(row.timestamp) || end * 1000),
        traceId: row.trace_id ? String(row.trace_id) : undefined,
      }));
    } catch (err) {
      logger.warn('SigNozAdapter.queryErrors failed', { error: err instanceof Error ? err.message : err });
      return [];
    }
  }

  async queryMetrics(params: QueryMetricsParams): Promise<OIEMetric[]> {
    if (!this.http) throw new Error('SigNozAdapter not initialized');
    const start = Math.floor(params.since.getTime() / 1000);
    const end = params.until ? Math.floor(params.until.getTime() / 1000) : Math.floor(Date.now() / 1000);

    const query = {
      start,
      end,
      step: 60,
      variables: {},
      compositeQuery: {
        queryType: 'promql',
        panelType: 'graph',
        promqlQueries: [{ query: params.metricName, name: 'A', disabled: false }],
      },
    };

    try {
      const res = await this.http.post('/api/v5/query_range', query);
      const series: unknown[] = res.data?.data?.result ?? [];
      const metrics: OIEMetric[] = [];
      for (const s of series) {
        if (typeof s === 'object' && s !== null && 'values' in s && Array.isArray(s.values)) {
          for (const [ts, val] of s.values as [number, string][]) {
            metrics.push({
              name: params.metricName,
              value: parseFloat(val),
              timestamp: new Date(ts * 1000),
            });
          }
        }
      }
      return metrics;
    } catch (err) {
      logger.warn('SigNozAdapter.queryMetrics failed', { error: err instanceof Error ? err.message : err });
      return [];
    }
  }

  async queryTraces(params: QueryTracesParams): Promise<OIETrace[]> {
    if (!this.http) throw new Error('SigNozAdapter not initialized');
    const start = Math.floor(params.since.getTime() / 1000);
    const end = params.until ? Math.floor(params.until.getTime() / 1000) : Math.floor(Date.now() / 1000);

    const filters = [
      ...(params.service ? [{ key: { key: 'serviceName', dataType: 'string', type: 'tag' }, op: 'contains', value: params.service }] : []),
      ...(params.hasError ? [{ key: { key: 'hasError', dataType: 'bool', type: 'tag' }, op: '=', value: true }] : []),
      ...(params.traceId ? [{ key: { key: 'traceID', dataType: 'string', type: 'tag' }, op: '=', value: params.traceId }] : []),
    ];

    const query = {
      start,
      end,
      step: 60,
      compositeQuery: {
        queryType: 'builder',
        panelType: 'table',
        builderQueries: {
          A: {
            dataSource: 'traces',
            queryName: 'A',
            expression: 'A',
            filters: { items: filters, op: 'AND' },
            aggregateOperator: 'count',
            groupBy: [
              { key: 'serviceName', dataType: 'string', type: 'tag' },
              { key: 'name', dataType: 'string', type: 'tag' },
              { key: 'hasError', dataType: 'bool', type: 'tag' },
            ],
            limit: params.limit ?? 50,
          },
        },
      },
    };

    try {
      const res = await this.http.post('/api/v5/query_range', query);
      const rows: unknown[] = res.data?.data?.result ?? [];
      return rows
        .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
        .map((row): OIETrace => ({
          traceId: String(row['traceID'] ?? randomUUID()),
          service: String(row['serviceName'] ?? ''),
          operation: String(row['name'] ?? ''),
          durationMs: Number(row['durationNano'] ?? 0) / 1_000_000,
          hasError: Boolean(row['hasError']),
          spans: Number(row['count'] ?? 1),
          timestamp: new Date(start * 1000),
        }));
    } catch (err) {
      logger.warn('SigNozAdapter.queryTraces failed', { error: err instanceof Error ? err.message : err });
      return [];
    }
  }

  async getIncidents(_since: Date): Promise<OIEIncident[]> {
    return [];
  }

  normalizeToOIEEvent(raw: OIEError | OIEIncident, projectId: string): OIEEvent {
    const isOIEError = 'count' in raw && 'message' in raw && !('title' in raw);
    const count = isOIEError ? (raw as OIEError).count : 1;
    const message = isOIEError ? (raw as OIEError).message : (raw as OIEIncident).title;
    const stackTrace: StackFrame[] | undefined = isOIEError ? (raw as OIEError).stackTrace : undefined;
    const traceId = isOIEError ? (raw as OIEError).traceId : undefined;

    return {
      id: randomUUID(),
      projectId,
      source: 'signoz',
      eventType: 'error',
      severity: toSeverity(count),
      errorCode: raw.errorCode,
      service: raw.service,
      message,
      stackTrace,
      traceId,
      fingerprint: `signoz:${raw.service}:${raw.errorCode}`,
      timestamp: isOIEError ? (raw as OIEError).lastSeen : (raw as OIEIncident).lastSeen,
      raw,
    };
  }
}
