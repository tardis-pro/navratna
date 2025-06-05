import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';

/**
 * Approval Workflow Entity
 * Manages approval processes for operations and tools
 * Updated to match ApprovalWorkflowService expectations
 */
@Entity('approval_workflows')
@Index(['operationId', 'status'])
@Index(['status', 'expiresAt'])
@Index(['createdAt'])
export class ApprovalWorkflow extends BaseEntity {
  @Column({ name: 'operation_id', type: 'uuid' })
  operationId: string;

  @Column({ name: 'required_approvers', type: 'jsonb' })
  requiredApprovers: string[];

  @Column({ name: 'current_approvers', type: 'jsonb', default: '[]' })
  currentApprovers: string[];

  @Column({ type: 'enum', enum: ['pending', 'approved', 'rejected', 'expired', 'cancelled'], default: 'pending' })
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt?: Date;

  @Column({ name: 'last_reminder_at', type: 'timestamp', nullable: true })
  lastReminderAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Relationships
  @ManyToOne('Operation', 'approvals', { nullable: true })
  @JoinColumn({ name: 'operation_id' })
  operation?: any;
} 