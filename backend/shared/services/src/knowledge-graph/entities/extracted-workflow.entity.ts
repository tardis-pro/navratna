import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../entities/base.entity.js';
import { UserEntity } from '../../entities/user.entity.js';
import { ExecutionPlan, OperationType } from '@uaip/types';

export enum WorkflowComplexity {
  SIMPLE = 'simple',
  MODERATE = 'moderate',
  COMPLEX = 'complex',
  EXPERT = 'expert'
}

export enum WorkflowStatus {
  DRAFT = 'draft',
  VALIDATED = 'validated',
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  ARCHIVED = 'archived'
}

@Entity('extracted_workflows')
@Index(['domain'])
@Index(['complexity'])
@Index(['confidence'])
@Index(['createdBy'])
@Index(['status'])
@Index(['workflowType'])
export class ExtractedWorkflowEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  domain?: string;

  @Column({
    type: 'enum',
    enum: WorkflowComplexity,
    default: WorkflowComplexity.MODERATE
  })
  complexity!: WorkflowComplexity;

  @Column({
    type: 'enum',
    enum: WorkflowStatus,
    default: WorkflowStatus.DRAFT
  })
  status!: WorkflowStatus;

  @Column({ type: 'decimal', precision: 3, scale: 2 })
  confidence!: number;

  // Align with existing Operation system - store as ExecutionPlan
  @Column({ type: 'jsonb', name: 'execution_plan' })
  executionPlan!: ExecutionPlan;

  // Additional workflow-specific type classification
  @Column({ 
    type: 'enum', 
    enum: OperationType, 
    name: 'workflow_type',
    default: OperationType.HYBRID_WORKFLOW 
  })
  workflowType!: OperationType;

  @Column({ type: 'json', nullable: true })
  tags?: string[];

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'created_by' })
  creator!: UserEntity;

  @Column({ type: 'json', nullable: true })
  extractionMetadata?: {
    extractionMethod?: string;
    sourceConversationIds?: string[];
    participants?: string[];
    extractedAt?: Date;
    patternMatches?: string[];
    contextAnalysis?: Record<string, any>;
  };

  @Column({ type: 'json', nullable: true })
  operationalMetadata?: {
    estimatedDuration?: number;
    prerequisites?: string[];
    expectedOutcomes?: string[];
    requiredCapabilities?: string[];
    resourceRequirements?: Record<string, any>;
    riskFactors?: string[];
    successCriteria?: string[];
  };

  @Column({ type: 'integer', name: 'usage_count', default: 0 })
  usageCount!: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, name: 'effectiveness_rating', nullable: true })
  effectivenessRating?: number;

  @Column({ type: 'integer', name: 'success_count', default: 0 })
  successCount!: number;

  @Column({ type: 'integer', name: 'failure_count', default: 0 })
  failureCount!: number;

  @Column({ type: 'timestamp', name: 'last_used_at', nullable: true })
  lastUsedAt?: Date;

  @Column({ type: 'uuid', name: 'validated_by', nullable: true })
  validatedBy?: string;

  @Column({ type: 'timestamp', name: 'validated_at', nullable: true })
  validatedAt?: Date;
}