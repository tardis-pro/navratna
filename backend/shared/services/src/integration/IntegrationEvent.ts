export interface IntegrationEvent {
  id: string;
  entityType: 'MCPServer' | 'MCPToolCall' | 'Tool' | 'Agent';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: Record<string, any>;
  timestamp: Date;
  processed: boolean;
  retries: number;
  lastError?: string;
  version: number;
}

export interface GraphSyncResult {
  success: boolean;
  eventId: string;
  error?: string;
  retryable: boolean;
}

export interface GraphSyncBatch {
  events: IntegrationEvent[];
  batchId: string;
  startTime: Date;
}

export enum GraphSyncStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRY_SCHEDULED = 'retry_scheduled'
} 