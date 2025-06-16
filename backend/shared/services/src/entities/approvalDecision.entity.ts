import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';

/**
 * Approval Decision Entity
 * Tracks individual approval decisions within workflows
 */
@Entity('approval_decisions')
@Index(['workflowId', 'decidedAt'])
@Index(['approverId'])
export class ApprovalDecision extends BaseEntity {
  @Column({ name: 'workflow_id', type: 'bigint' })
  workflowId: number;

  @Column({ name: 'approver_id', type: 'bigint' })
  approverId: number;

  @Column({ type: 'enum', enum: ['approve', 'reject'] })
  decision: 'approve' | 'reject';

  @Column({ type: 'jsonb', nullable: true })
  conditions?: string[];

  @Column({ type: 'text', nullable: true })
  feedback?: string;

  @Column({ name: 'decided_at', type: 'timestamp' })
  decidedAt: Date;

  // Relationships
  @ManyToOne('ApprovalWorkflow', 'decisions')
  @JoinColumn({ name: 'workflow_id' })
  workflow?: any;
} 