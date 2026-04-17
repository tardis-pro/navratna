export type AdapterConfigFieldType = 'string' | 'number' | 'boolean' | 'url' | 'secret';

export interface AdapterConfigField {
  name: string;
  type: AdapterConfigFieldType;
  required: boolean;
  description: string;
  defaultValue?: string | number | boolean;
  envVar?: string;
}

export interface AdapterConfigSchema {
  fields: AdapterConfigField[];
  validate(config: Record<string, unknown>): void;
}

export type AdapterCapabilityType =
  | 'query_errors'
  | 'query_metrics'
  | 'query_traces'
  | 'get_incidents'
  | 'webhook_subscribe'
  | 'create_issue'
  | 'update_issue'
  | 'search_issues'
  | 'get_file'
  | 'create_pr'
  | 'get_commits';

export interface AdapterCapability {
  type: AdapterCapabilityType;
  supportsRealtime: boolean;
  supportsHistorical: boolean;
  maxLookbackDays?: number;
}

export interface AdapterHealth {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  checkedAt: Date;
}

export interface BaseAdapter {
  readonly id: string;
  readonly type: string;
  getConfigSchema(): AdapterConfigSchema;
  getCapabilities(): AdapterCapability[];
  initialize(config: Record<string, unknown>): Promise<void>;
  healthCheck(): Promise<AdapterHealth>;
  shutdown(): Promise<void>;
}
