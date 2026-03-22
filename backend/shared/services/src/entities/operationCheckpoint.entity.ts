import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import type { Operation } from './operation.entity';

/**
 * Operation Checkpoint Entity
 * Manages checkpoints and rollback points for operations
 */
@Entity('operation_checkpoints')
@Index(['operationId', 'createdAt'])
@Index(['checkpointType', 'isActive'])
@Index(['stepNumber'])
export class OperationCheckpoint extends BaseEntity {
  @Column({ name: 'operation_id', type: 'varchar' })
  operationId: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({
    name: 'checkpoint_type',
    type: 'enum',
    enum: ['manual', 'automatic', 'step', 'milestone'],
    default: 'automatic',
  })
  checkpointType: 'manual' | 'automatic' | 'step' | 'milestone';

  @Column({ name: 'step_number', nullable: true })
  stepNumber?: number;

  @Column({ type: 'jsonb' })
  state: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  context?: Record<string, unknown>;

  @Column({ name: 'created_by', type: 'varchar', nullable: true })
  createdBy?: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'can_rollback_to', default: true })
  canRollbackTo: boolean;

  @Column({ name: 'rollback_instructions', type: 'text', nullable: true })
  rollbackInstructions?: string;

  @Column({ name: 'data_size_bytes', nullable: true })
  dataSizeBytes?: number;

  @Column({ name: 'compression_used', default: false })
  compressionUsed: boolean;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt?: Date;

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  // Relationships
  @ManyToOne('Operation', 'checkpoints')
  @JoinColumn({ name: 'operation_id' })
  operation: Operation;
}
