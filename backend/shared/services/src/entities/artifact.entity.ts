import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { 
  ArtifactType, 
  ValidationResult 
} from '@uaip/types';

// Note: Using string-based relationships to avoid circular dependencies

/**
 * Artifact Entity for the Artifact System
 * Implements the comprehensive artifact model from the TypeORM migration plan
 */
@Entity('artifacts')
@Index(['type', 'createdAt'])
@Index(['conversationId'])
@Index(['generatedBy'])
@Index(['language', 'framework'])
export class Artifact extends BaseEntity {
  @Column({ type: 'enum', enum: ['code', 'test', 'documentation', 'prd', 'config', 'deployment', 'script', 'template', 'report', 'analysis'] })
  type: ArtifactType;

  @Column({ type: 'text' })
  content: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ nullable: true })
  language?: string;

  @Column({ nullable: true })
  framework?: string;

  @Column({ name: 'target_file', nullable: true })
  targetFile?: string;

  @Column({ name: 'estimated_effort', type: 'enum', enum: ['low', 'medium', 'high'], nullable: true })
  estimatedEffort?: 'low' | 'medium' | 'high';

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  // Project Integration
  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId?: string;

  // Note: ProjectEntity relation will be added after it's created

  // Traceability
  @Column({ name: 'conversation_id', type: 'varchar' })
  conversationId: string;

  @Column({ name: 'generated_by', type: 'varchar' })
  generatedBy: number;

  @Column({ name: 'generated_at', type: 'timestamp' })
  generatedAt: Date;

  @Column({ length: 255 })
  generator: string;

  @Column({ type: 'decimal', precision: 3, scale: 2 })
  confidence: number;

  @Column({ name: 'source_messages', type: 'jsonb', default: '[]' })
  sourceMessages: string[];

  // Validation
  @Column({ name: 'validation_result', type: 'jsonb', nullable: true })
  validationResult?: ValidationResult;

  @Column({ name: 'validation_status', type: 'enum', enum: ['pending', 'valid', 'invalid', 'warning'], default: 'pending' })
  validationStatus: 'pending' | 'valid' | 'invalid' | 'warning';

  @Column({ name: 'validation_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  validationScore?: number;

  // Version and iteration tracking
  @Column({ length: 50, default: '1.0.0' })
  version: string;

  @Column({ name: 'parent_artifact_id', type: 'varchar', nullable: true })
  parentArtifactId?: number;

  @Column({ name: 'iteration_count', default: 1 })
  iterationCount: number;

  @Column({ name: 'is_latest_version', default: true })
  isLatestVersion: boolean;

  // Status and lifecycle
  @Column({ type: 'enum', enum: ['draft', 'review', 'approved', 'deployed', 'archived'], default: 'draft' })
  status: 'draft' | 'review' | 'approved' | 'deployed' | 'archived';

  @Column({ name: 'approved_by', type: 'varchar', nullable: true })
  approvedBy?: number;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt?: Date;

  @Column({ name: 'deployed_at', type: 'timestamp', nullable: true })
  deployedAt?: Date;

  @Column({ name: 'archived_at', type: 'timestamp', nullable: true })
  archivedAt?: Date;

  // Quality and performance metrics
  @Column({ name: 'quality_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  qualityScore?: number;

  @Column({ name: 'user_rating', type: 'decimal', precision: 3, scale: 2, nullable: true })
  userRating?: number;

  @Column({ name: 'usage_count', default: 0 })
  usageCount: number;

  @Column({ name: 'download_count', default: 0 })
  downloadCount: number;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt?: Date;

  // Size and complexity metrics
  @Column({ name: 'content_size_bytes', nullable: true })
  contentSizeBytes?: number;

  @Column({ name: 'line_count', nullable: true })
  lineCount?: number;

  @Column({ name: 'complexity_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  complexityScore?: number;

  // Security and compliance
  @Column({ name: 'security_level', type: 'enum', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' })
  securityLevel: 'low' | 'medium' | 'high' | 'critical';

  @Column({ name: 'compliance_tags', type: 'jsonb', default: '[]' })
  complianceTags: string[];

  @Column({ name: 'security_scan_result', type: 'jsonb', nullable: true })
  securityScanResult?: Record<string, any>;

  @Column({ name: 'license', nullable: true })
  license?: string;

  // Dependencies and requirements
  @Column({ type: 'jsonb', default: '[]' })
  dependencies: string[];

  @Column({ name: 'system_requirements', type: 'jsonb', nullable: true })
  systemRequirements?: Record<string, any>;

  @Column({ name: 'deployment_config', type: 'jsonb', nullable: true })
  deploymentConfig?: Record<string, any>;

  // Metadata and context
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ name: 'generation_context', type: 'jsonb', nullable: true })
  generationContext?: Record<string, any>;

  @Column({ name: 'external_references', type: 'jsonb', nullable: true })
  externalReferences?: Record<string, string>;

  // Relationships
  @OneToMany('ArtifactReview', 'artifact')
  reviews: any[];

  @OneToMany('ArtifactDeployment', 'artifact')
  deployments: any[];
} 