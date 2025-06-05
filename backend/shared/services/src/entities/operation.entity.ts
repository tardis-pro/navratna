import { Entity, Column, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { OperationStatus, ExecutionPlan } from '@uaip/types';

// Related entities will be referenced by string to avoid circular dependencies

/**
 * Enhanced Operation Entity with comprehensive operation tracking and state management
 * Implements the enhanced operation model from the TypeORM migration plan
 */
@Entity('operations')
@Index(['status', 'agentId'])
@Index(['type', 'createdAt'])
@Index(['priority', 'status'])
@Index(['userId'])
@Index(['startedAt', 'completedAt'])
export class Operation extends BaseEntity {
  @Column({ length: 100 })
  type: string;

  @Column({ type: 'enum', enum: OperationStatus })
  status: OperationStatus;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'execution_plan', type: 'jsonb' })
  executionPlan: ExecutionPlan;

  @Column({ type: 'jsonb', nullable: true })
  context?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  result?: any;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ name: 'estimated_duration', nullable: true })
  estimatedDuration?: number;

  @Column({ name: 'actual_duration', nullable: true })
  actualDuration?: number;

  @Column({ type: 'enum', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' })
  priority: 'low' | 'medium' | 'high' | 'urgent';

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  progress?: number;

  @Column({ name: 'current_step', default: 0 })
  currentStep: number;

  @Column({ name: 'total_steps', nullable: true })
  totalSteps?: number;

  // Enhanced tracking fields
  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retries', default: 3 })
  maxRetries: number;

  @Column({ name: 'timeout_seconds', nullable: true })
  timeoutSeconds?: number;

  @Column({ name: 'requires_approval', default: false })
  requiresApproval: boolean;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt?: Date;

  // Resource and cost tracking
  @Column({ name: 'resource_usage', type: 'jsonb', nullable: true })
  resourceUsage?: Record<string, any>;

  @Column({ name: 'cost_estimate', type: 'decimal', precision: 10, scale: 2, nullable: true })
  costEstimate?: number;

  @Column({ name: 'actual_cost', type: 'decimal', precision: 10, scale: 2, nullable: true })
  actualCost?: number;

  // Quality and performance metrics
  @Column({ name: 'quality_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  qualityScore?: number;

  @Column({ name: 'performance_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  performanceScore?: number;

  @Column({ name: 'user_satisfaction', type: 'decimal', precision: 3, scale: 2, nullable: true })
  userSatisfaction?: number;

  // Security and compliance
  @Column({ name: 'security_level', type: 'enum', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' })
  securityLevel: 'low' | 'medium' | 'high' | 'critical';

  @Column({ name: 'compliance_tags', type: 'jsonb', default: '[]' })
  complianceTags: string[];

  @Column({ name: 'audit_trail', type: 'jsonb', default: '[]' })
  auditTrail: any[];

  // Metadata and tags
  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ name: 'external_references', type: 'jsonb', nullable: true })
  externalReferences?: Record<string, string>;

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

  // Relationships
  @ManyToOne('Agent', { eager: false })
  @JoinColumn({ name: 'agent_id' })
  agent: any;

  @OneToMany('OperationState', 'operation')
  states: any[];

  @OneToMany('OperationCheckpoint', 'operation')
  checkpoints: any[];

  @OneToMany('StepResult', 'operation')
  stepResults: any[];

  @OneToMany('ApprovalWorkflow', 'operation')
  approvals: any[];
} 