import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ExecutionBaseEntity } from './base.entity.js';
import { MCPServer } from './mcp-server.entity.js';

/**
 * MCP Tool Call Entity — owned by the Execution Plane (capability-registry).
 * Tracks every tool invocation through any MCP server.
 */
@Entity('mcp_tool_calls')
@Index(['serverId', 'timestamp'])
@Index(['status'])
@Index(['toolName'])
@Index(['timestamp', 'duration'])
export class MCPToolCall extends ExecutionBaseEntity {
  @Column({ name: 'server_id', type: 'varchar' })
  serverId: string;

  @Column({ name: 'tool_name', length: 255 })
  toolName: string;

  @Column({ type: 'jsonb' })
  parameters: Record<string, unknown>;

  @Column({ type: 'timestamp' })
  timestamp: Date;

  @Column({ type: 'enum', enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' })
  status: 'pending' | 'running' | 'completed' | 'failed';

  @Column({ type: 'jsonb', nullable: true })
  result?: unknown;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  duration?: number;

  // ── Execution context ──────────────────────────────────────────────────────
  @Column({ name: 'agent_id', type: 'varchar', nullable: true })
  agentId?: string;

  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId?: string;

  @Column({ name: 'conversation_id', type: 'varchar', nullable: true })
  conversationId?: string;

  @Column({ name: 'operation_id', type: 'varchar', nullable: true })
  operationId?: string;

  @Column({ name: 'session_id', type: 'varchar', nullable: true })
  sessionId?: string;

  // ── Timing ─────────────────────────────────────────────────────────────────
  @Column({ name: 'start_time', type: 'timestamp', nullable: true })
  startTime?: Date;

  @Column({ name: 'end_time', type: 'timestamp', nullable: true })
  endTime?: Date;

  @Column({ name: 'queue_time_ms', nullable: true })
  queueTimeMs?: number;

  @Column({ name: 'execution_time_ms', nullable: true })
  executionTimeMs?: number;

  @Column({ name: 'network_time_ms', nullable: true })
  networkTimeMs?: number;

  // ── Resource usage ─────────────────────────────────────────────────────────
  @Column({ name: 'memory_usage_mb', type: 'decimal', precision: 10, scale: 2, nullable: true })
  memoryUsageMb?: number;

  @Column({ name: 'cpu_usage_percent', type: 'decimal', precision: 5, scale: 2, nullable: true })
  cpuUsagePercent?: number;

  @Column({ name: 'network_bytes_sent', nullable: true })
  networkBytesSent?: number;

  @Column({ name: 'network_bytes_received', nullable: true })
  networkBytesReceived?: number;

  // ── Reliability ────────────────────────────────────────────────────────────
  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retries', default: 3 })
  maxRetries: number;

  @Column({ name: 'timeout_seconds', nullable: true })
  timeoutSeconds?: number;

  @Column({ name: 'quality_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  qualityScore?: number;

  @Column({ name: 'user_satisfaction', type: 'decimal', precision: 3, scale: 2, nullable: true })
  userSatisfaction?: number;

  // ── Security / compliance ──────────────────────────────────────────────────
  @Column({
    name: 'security_level',
    type: 'enum',
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  })
  securityLevel: 'low' | 'medium' | 'high' | 'critical';

  @Column({ name: 'approval_required', default: false })
  approvalRequired: boolean;

  @Column({ name: 'approved_by', type: 'varchar', nullable: true })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt?: Date;

  @Column({ name: 'compliance_tags', type: 'jsonb', default: '[]' })
  complianceTags: string[];

  @Column({ name: 'audit_trail', type: 'jsonb', default: '[]' })
  auditTrail: unknown[];

  // ── Error / debug ──────────────────────────────────────────────────────────
  @Column({ name: 'error_code', nullable: true })
  errorCode?: string;

  @Column({
    name: 'error_category',
    type: 'enum',
    enum: ['network', 'timeout', 'validation', 'execution', 'permission', 'resource'],
    nullable: true,
  })
  errorCategory?: 'network' | 'timeout' | 'validation' | 'execution' | 'permission' | 'resource';

  @Column({ name: 'stack_trace', type: 'text', nullable: true })
  stackTrace?: string;

  @Column({ name: 'debug_info', type: 'jsonb', nullable: true })
  debugInfo?: Record<string, unknown>;

  // ── Cost ───────────────────────────────────────────────────────────────────
  @Column({ name: 'cost_estimate', type: 'decimal', precision: 10, scale: 2, nullable: true })
  costEstimate?: number;

  @Column({ name: 'actual_cost', type: 'decimal', precision: 10, scale: 2, nullable: true })
  actualCost?: number;

  @Column({ name: 'billing_category', nullable: true })
  billingCategory?: string;

  // ── Cancellation ───────────────────────────────────────────────────────────
  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt?: Date;

  @Column({ name: 'cancelled_by', type: 'varchar', nullable: true })
  cancelledBy?: string;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason?: string;

  @Column({ name: 'cleanup_completed', default: false })
  cleanupCompleted: boolean;

  @Column({ name: 'cleanup_at', type: 'timestamp', nullable: true })
  cleanupAt?: Date;

  // ── Metadata ───────────────────────────────────────────────────────────────
  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ name: 'call_context', type: 'jsonb', nullable: true })
  callContext?: Record<string, unknown>;

  @Column({ name: 'external_references', type: 'jsonb', nullable: true })
  externalReferences?: Record<string, string>;

  // ── Relationship ───────────────────────────────────────────────────────────
  @ManyToOne(() => MCPServer, { eager: false, nullable: true })
  @JoinColumn({ name: 'server_id' })
  server?: MCPServer;
}
