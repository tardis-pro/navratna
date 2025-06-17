import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';

/**
 * Artifact Review Entity for the Artifact System
 * Implements the artifact review and approval workflow from the TypeORM migration plan
 */
@Entity('artifact_reviews')
@Index(['artifactId', 'status'])
@Index(['reviewerId'])
@Index(['status', 'createdAt'])
export class ArtifactReview extends BaseEntity {
  @Column({ name: 'artifact_id', type: 'varchar' })
  artifactId: string;

  @Column({ name: 'reviewer_id', type: 'varchar' })
  reviewerId: string;

  @Column({ type: 'enum', enum: ['pending', 'approved', 'rejected', 'needs-changes'], default: 'pending' })
  status: 'pending' | 'approved' | 'rejected' | 'needs-changes';

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  score?: number;

  @Column({ type: 'text', nullable: true })
  comments?: string;

  @Column({ type: 'jsonb', default: '[]' })
  suggestions: string[];

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt?: Date;

  // Review criteria and detailed feedback
  @Column({ name: 'quality_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  qualityScore?: number;

  @Column({ name: 'security_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  securityScore?: number;

  @Column({ name: 'performance_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  performanceScore?: number;

  @Column({ name: 'maintainability_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  maintainabilityScore?: number;

  @Column({ name: 'documentation_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  documentationScore?: number;

  // Detailed review sections
  @Column({ name: 'code_quality_feedback', type: 'text', nullable: true })
  codeQualityFeedback?: string;

  @Column({ name: 'security_feedback', type: 'text', nullable: true })
  securityFeedback?: string;

  @Column({ name: 'performance_feedback', type: 'text', nullable: true })
  performanceFeedback?: string;

  @Column({ name: 'documentation_feedback', type: 'text', nullable: true })
  documentationFeedback?: string;

  // Review process tracking
  @Column({ name: 'review_duration_minutes', nullable: true })
  reviewDurationMinutes?: number;

  @Column({ name: 'review_type', type: 'enum', enum: ['automated', 'manual', 'peer', 'expert'], default: 'manual' })
  reviewType: 'automated' | 'manual' | 'peer' | 'expert';

  @Column({ name: 'review_priority', type: 'enum', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' })
  reviewPriority: 'low' | 'medium' | 'high' | 'urgent';

  @Column({ name: 'requires_follow_up', default: false })
  requiresFollowUp: boolean;

  @Column({ name: 'follow_up_date', type: 'timestamp', nullable: true })
  followUpDate?: Date;

  // Approval workflow
  @Column({ name: 'approval_level', type: 'enum', enum: ['junior', 'senior', 'lead', 'architect'], nullable: true })
  approvalLevel?: 'junior' | 'senior' | 'lead' | 'architect';

  @Column({ name: 'escalated_to', type: 'varchar', nullable: true })
  escalatedTo?: number;

  @Column({ name: 'escalated_at', type: 'timestamp', nullable: true })
  escalatedAt?: Date;

  @Column({ name: 'escalation_reason', type: 'text', nullable: true })
  escalationReason?: string;

  // Review checklist and compliance
  @Column({ name: 'checklist_items', type: 'jsonb', default: '[]' })
  checklistItems: any[];

  @Column({ name: 'compliance_checks', type: 'jsonb', default: '[]' })
  complianceChecks: any[];

  @Column({ name: 'security_scan_passed', nullable: true })
  securityScanPassed?: boolean;

  @Column({ name: 'automated_tests_passed', nullable: true })
  automatedTestsPassed?: boolean;

  // Metadata and context
  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ name: 'review_context', type: 'jsonb', nullable: true })
  reviewContext?: Record<string, any>;

  @Column({ name: 'external_references', type: 'jsonb', nullable: true })
  externalReferences?: Record<string, string>;

  // Relationships
  @ManyToOne('Artifact', { eager: false })
  @JoinColumn({ name: 'artifact_id' })
  artifact: any;
} 