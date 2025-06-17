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

  @Column({ name: 'agent_id', type: 'string' })
  agentId: string;

  @Column({ name: 'user_id', type: 'string' })
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

  @Column({ name: 'step_details', type: 'jsonb', nullable: true })
  stepDetails?: Record<string, any>;

  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retries', default: 3 })
  maxRetries: number;

  @Column({ name: 'retry_delay', nullable: true })
  retryDelay?: number;

  @Column({ name: 'timeout_duration', nullable: true })
  timeoutDuration?: number;

  @Column({ name: 'resource_requirements', type: 'jsonb', nullable: true })
  resourceRequirements?: Record<string, any>;

  @Column({ name: 'resource_allocation', type: 'jsonb', nullable: true })
  resourceAllocation?: Record<string, any>;

  @Column({ name: 'performance_metrics', type: 'jsonb', nullable: true })
  performanceMetrics?: Record<string, any>;

  @Column({ name: 'quality_metrics', type: 'jsonb', nullable: true })
  qualityMetrics?: Record<string, any>;

  @Column({ name: 'dependencies', type: 'jsonb', default: '[]' })
  dependencies: string[];

  @Column({ name: 'dependent_operations', type: 'jsonb', default: '[]' })
  dependentOperations: string[];

  @Column({ name: 'tags', type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ name: 'is_archived', default: false })
  isArchived: boolean;

  @Column({ name: 'archived_at', type: 'timestamp', nullable: true })
  archivedAt?: Date;

  @Column({ name: 'archived_by', type: 'string', nullable: true })
  archivedBy?: number;

  @Column({ name: 'archive_reason', type: 'text', nullable: true })
  archiveReason?: string;

  // Relationships
  @OneToMany('OperationState', 'operation')
  states: any[];

  @OneToMany('ApprovalWorkflow', 'operation')
  approvalWorkflows: any[];

  @OneToMany('Artifact', 'operation')
  artifacts: any[];
} 