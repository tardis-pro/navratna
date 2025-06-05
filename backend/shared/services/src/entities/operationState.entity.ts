import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { OperationStatus } from '@uaip/types';

/**
 * Operation State Entity
 * Tracks state changes and transitions for operations
 */
@Entity('operation_states')
@Index(['operationId', 'transitionedAt'])
@Index(['fromStatus', 'toStatus'])
@Index(['transitionedAt'])
export class OperationState extends BaseEntity {
  @Column({ name: 'operation_id', type: 'uuid' })
  operationId: string;

  @Column({ name: 'from_status', type: 'enum', enum: OperationStatus, nullable: true })
  fromStatus?: OperationStatus;

  @Column({ name: 'to_status', type: 'enum', enum: OperationStatus })
  toStatus: OperationStatus;

  @Column({ name: 'transitioned_at', type: 'timestamp' })
  transitionedAt: Date;

  @Column({ name: 'transitioned_by', type: 'uuid', nullable: true })
  transitionedBy?: string;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ type: 'jsonb', nullable: true })
  context?: Record<string, any>;

  @Column({ name: 'duration_in_previous_state_ms', nullable: true })
  durationInPreviousStateMs?: number;

  @Column({ name: 'is_automatic', default: false })
  isAutomatic: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Relationships
  @ManyToOne('Operation', 'states')
  @JoinColumn({ name: 'operation_id' })
  operation: any;
} 