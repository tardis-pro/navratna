import { Entity, Column, Index } from 'typeorm';
import { ExecutionBaseEntity } from './base.entity.js';
import { MCPServerType, MCPServerStatus } from '@uaip/types';

// Defined locally — pure TypeScript structural types; no runtime value needed.
interface MCPServerStats {
  totalCalls?: number;
  successRate?: number;
  averageResponseTime?: number;
  lastCallTime?: Date;
}
interface MCPServerCapabilities {
  tools?: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  resources?: Array<{ uri: string; name?: string }>;
  prompts?: Array<{ name: string; description?: string }>;
}

/**
 * MCP Server Entity — owned by the Execution Plane (capability-registry).
 * Schema: mcp_servers table.  All HTTP transport fields and encrypted headers live here.
 */
@Entity('mcp_servers')
@Index(['enabled', 'autoStart'])
@Index(['type'])
@Index(['status'])
@Index(['securityLevel'])
export class MCPServer extends ExecutionBaseEntity {
  @Column({ length: 255, unique: true })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: ['filesystem', 'database', 'api', 'tool', 'knowledge', 'custom'] })
  type: MCPServerType;

  // ── Transport ──────────────────────────────────────────────────────────────
  /** stdio command — null for HTTP transports */
  @Column({ type: 'text', nullable: true })
  command?: string;

  @Column({ type: 'jsonb', default: '[]' })
  args: string[];

  @Column({ type: 'jsonb', nullable: true })
  env?: Record<string, string>;

  @Column({ name: 'working_directory', nullable: true })
  workingDirectory?: string;

  /** 'stdio' | 'http' | 'streamable-http' */
  @Column({ name: 'transport_type', length: 20, default: 'stdio' })
  transportType: string;

  /** HTTP endpoint URL — null for stdio */
  @Column({ type: 'text', nullable: true })
  url?: string;

  /**
   * AES-256-GCM encrypted JSON blob of HTTP headers (API keys etc.).
   * Only the capability-registry process can decrypt this at runtime.
   */
  @Column({ type: 'text', nullable: true })
  headers?: string;

  // ── Lifecycle config ────────────────────────────────────────────────────────
  @Column({ default: true })
  enabled: boolean;

  @Column({ name: 'auto_start', default: false })
  autoStart: boolean;

  @Column({ name: 'retry_attempts', default: 3 })
  retryAttempts: number;

  @Column({ name: 'health_check_interval', default: 30000 })
  healthCheckInterval: number;

  @Column({ default: 30000 })
  timeout: number;

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ length: 255 })
  author: string;

  @Column({ length: 50 })
  version: string;

  @Column({ name: 'requires_approval', default: false })
  requiresApproval: boolean;

  @Column({
    name: 'security_level',
    type: 'enum',
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  })
  securityLevel: string;

  // ── Runtime status ─────────────────────────────────────────────────────────
  @Column({
    type: 'enum',
    enum: ['stopped', 'starting', 'running', 'error', 'stopping'],
    default: 'stopped',
  })
  status: MCPServerStatus;

  @Column({ nullable: true })
  pid?: number;

  @Column({ name: 'start_time', type: 'timestamp', nullable: true })
  startTime?: Date;

  @Column({ name: 'last_health_check', type: 'timestamp', nullable: true })
  lastHealthCheck?: Date;

  @Column({ type: 'text', nullable: true })
  error?: string;

  // ── Capabilities ───────────────────────────────────────────────────────────
  @Column({ type: 'jsonb', nullable: true })
  capabilities?: MCPServerCapabilities;

  @Column({ name: 'capabilities_last_updated', type: 'timestamp', nullable: true })
  capabilitiesLastUpdated?: Date;

  @Column({ name: 'tool_count', default: 0 })
  toolCount: number;

  @Column({ name: 'resource_count', default: 0 })
  resourceCount: number;

  @Column({ name: 'prompt_count', default: 0 })
  promptCount: number;

  // ── Statistics ─────────────────────────────────────────────────────────────
  @Column({ type: 'jsonb', nullable: true })
  stats?: MCPServerStats;

  @Column({ name: 'total_calls', default: 0 })
  totalCalls: number;

  @Column({ name: 'successful_calls', default: 0 })
  successfulCalls: number;

  @Column({ name: 'failed_calls', default: 0 })
  failedCalls: number;

  @Column({
    name: 'average_response_time',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  averageResponseTime?: number;

  @Column({ name: 'last_call_time', type: 'timestamp', nullable: true })
  lastCallTime?: Date;

  // ── Observability ──────────────────────────────────────────────────────────
  @Column({ name: 'uptime_seconds', default: 0 })
  uptimeSeconds: number;

  @Column({ name: 'memory_usage_mb', type: 'decimal', precision: 10, scale: 2, nullable: true })
  memoryUsageMb?: number;

  @Column({ name: 'cpu_usage_percent', type: 'decimal', precision: 5, scale: 2, nullable: true })
  cpuUsagePercent?: number;

  @Column({ name: 'restart_count', default: 0 })
  restartCount: number;

  @Column({ name: 'last_restart_time', type: 'timestamp', nullable: true })
  lastRestartTime?: Date;

  @Column({ name: 'crash_count', default: 0 })
  crashCount: number;

  @Column({ name: 'last_crash_time', type: 'timestamp', nullable: true })
  lastCrashTime?: Date;

  // ── Deployment config ──────────────────────────────────────────────────────
  @Column({ name: 'deployment_config', type: 'jsonb', nullable: true })
  deploymentConfig?: Record<string, unknown>;

  @Column({ name: 'environment_variables', type: 'jsonb', nullable: true })
  environmentVariables?: Record<string, string>;

  @Column({ name: 'resource_limits', type: 'jsonb', nullable: true })
  resourceLimits?: Record<string, unknown>;

  @Column({ name: 'network_config', type: 'jsonb', nullable: true })
  networkConfig?: Record<string, unknown>;

  // ── Logging / debug ────────────────────────────────────────────────────────
  @Column({
    name: 'log_level',
    type: 'enum',
    enum: ['debug', 'info', 'warn', 'error'],
    default: 'info',
  })
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  @Column({ name: 'log_retention_days', default: 7 })
  logRetentionDays: number;

  @Column({ name: 'debug_mode', default: false })
  debugMode: boolean;

  @Column({ name: 'trace_enabled', default: false })
  traceEnabled: boolean;

  // ── Maintenance / lifecycle ────────────────────────────────────────────────
  @Column({ name: 'maintenance_mode', default: false })
  maintenanceMode: boolean;

  @Column({ name: 'maintenance_message', type: 'text', nullable: true })
  maintenanceMessage?: string;

  @Column({ name: 'scheduled_maintenance', type: 'timestamp', nullable: true })
  scheduledMaintenance?: Date;

  @Column({ name: 'deprecation_date', type: 'timestamp', nullable: true })
  deprecationDate?: Date;

  @Column({ name: 'end_of_life_date', type: 'timestamp', nullable: true })
  endOfLifeDate?: Date;

  // ── Metadata ───────────────────────────────────────────────────────────────
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ name: 'external_references', type: 'jsonb', nullable: true })
  externalReferences?: Record<string, string>;

  @Column({ name: 'documentation_url', type: 'text', nullable: true })
  documentationUrl?: string;

  @Column({ name: 'support_contact', nullable: true })
  supportContact?: string;
}
