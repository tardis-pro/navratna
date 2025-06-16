import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';

/**
 * Step Result Entity
 * Tracks results and outcomes of individual operation steps
 */
@Entity('step_results')
@Index(['operationId', 'stepNumber'])
@Index(['status', 'completedAt'])
@Index(['stepType'])
export class StepResult extends BaseEntity {
  @Column({ name: 'operation_id', type: 'bigint' })
  operationId: number;

  @Column({ name: 'step_number' })
  stepNumber: number;

  @Column({ name: 'step_name', length: 255 })
  stepName: string;

  @Column({ name: 'step_type', length: 100 })
  stepType: string;

  @Column({ type: 'enum', enum: ['pending', 'running', 'completed', 'failed', 'skipped', 'cancelled'], default: 'pending' })
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ name: 'execution_time_ms', nullable: true })
  executionTimeMs?: number;

  @Column({ type: 'jsonb', nullable: true })
  input?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  output?: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ name: 'error_code', length: 50, nullable: true })
  errorCode?: string;

  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retries', default: 3 })
  maxRetries: number;

  @Column({ name: 'quality_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  qualityScore?: number;

  @Column({ name: 'confidence_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  confidenceScore?: number;

  @Column({ type: 'jsonb', nullable: true })
  metrics?: Record<string, any>;

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Relationships
  @ManyToOne('Operation', 'stepResults')
  @JoinColumn({ name: 'operation_id' })
  operation: any;
} 