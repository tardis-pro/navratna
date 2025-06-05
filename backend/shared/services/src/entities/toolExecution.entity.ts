import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { 
  ToolExecutionStatus, 
  ToolExecutionError 
} from '@uaip/types';

/**
 * Tool Execution Entity for the Tool System
 * Implements the comprehensive tool execution tracking model from the TypeORM migration plan
 */
@Entity('tool_executions')
@Index(['status', 'agentId'])
@Index(['toolId', 'startTime'])
@Index(['approvalRequired', 'status'])
@Index(['startTime', 'endTime'])
export class ToolExecution extends BaseEntity {
  @Column({ name: 'tool_id', type: 'uuid' })
  toolId: string;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @Column({ type: 'jsonb' })
  parameters: Record<string, any>;

  @Column({ type: 'enum', enum: ToolExecutionStatus })
  status: ToolExecutionStatus;

  @Column({ name: 'start_time', type: 'timestamp' })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamp', nullable: true })
  endTime?: Date;

  @Column({ type: 'jsonb', nullable: true })
  result?: any;

  @Column({ type: 'jsonb', nullable: true })
  error?: ToolExecutionError;

  @Column({ name: 'approval_required', default: false })
  approvalRequired: boolean;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  cost?: number;

  @Column({ name: 'execution_time_ms', nullable: true })
  executionTimeMs?: number;

  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retries', default: 3 })
  maxRetries: number;

  // Enhanced tracking fields
  @Column({ name: 'operation_id', type: 'uuid', nullable: true })
  operationId?: string;

  @Column({ name: 'conversation_id', type: 'uuid', nullable: true })
  conversationId?: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string;

  @Column({ name: 'session_id', type: 'uuid', nullable: true })
  sessionId?: string;

  // Performance and quality metrics
  @Column({ name: 'quality_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  qualityScore?: number;

  @Column({ name: 'user_satisfaction', type: 'decimal', precision: 3, scale: 2, nullable: true })
  userSatisfaction?: number;

  @Column({ name: 'performance_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  performanceScore?: number;

  // Resource usage tracking
  @Column({ name: 'memory_usage_mb', type: 'decimal', precision: 10, scale: 2, nullable: true })
  memoryUsageMb?: number;

  @Column({ name: 'cpu_usage_percent', type: 'decimal', precision: 5, scale: 2, nullable: true })
  cpuUsagePercent?: number;

  @Column({ name: 'network_bytes_sent', nullable: true })
  networkBytesSent?: number;

  @Column({ name: 'network_bytes_received', nullable: true })
  networkBytesReceived?: number;

  // Security and compliance
  @Column({ name: 'security_level', type: 'enum', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' })
  securityLevel: 'low' | 'medium' | 'high' | 'critical';

  @Column({ name: 'compliance_tags', type: 'jsonb', default: '[]' })
  complianceTags: string[];

  @Column({ name: 'audit_trail', type: 'jsonb', default: '[]' })
  auditTrail: any[];

  // Cancellation and cleanup
  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt?: Date;

  @Column({ name: 'cancelled_by', type: 'uuid', nullable: true })
  cancelledBy?: string;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason?: string;

  @Column({ name: 'cleanup_completed', default: false })
  cleanupCompleted: boolean;

  @Column({ name: 'cleanup_at', type: 'timestamp', nullable: true })
  cleanupAt?: Date;

  // Metadata and context
  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ name: 'external_references', type: 'jsonb', nullable: true })
  externalReferences?: Record<string, string>;

  @Column({ name: 'execution_context', type: 'jsonb', nullable: true })
  executionContext?: Record<string, any>;

  // Relationships
  @ManyToOne('ToolDefinition', { eager: false })
  @JoinColumn({ name: 'tool_id' })
  tool: any;

  @ManyToOne('Agent', { eager: false })
  @JoinColumn({ name: 'agent_id' })
  agent: any;
} 