import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';

/**
 * Artifact Deployment Entity
 * Tracks deployment history and status of artifacts
 */
@Entity('artifact_deployments')
@Index(['artifactId', 'deployedAt'])
@Index(['environment', 'status'])
@Index(['deployedBy'])
export class ArtifactDeployment extends BaseEntity {
  @Column({ name: 'artifact_id', type: 'string' })
  artifactId: string;

  @Column({ length: 100 })
  environment: string;

  @Column({ type: 'enum', enum: ['pending', 'deploying', 'deployed', 'failed', 'rolled_back'], default: 'pending' })
  status: 'pending' | 'deploying' | 'deployed' | 'failed' | 'rolled_back';

  @Column({ name: 'deployed_by', type: 'string' })
  deployedBy: number;

  @Column({ name: 'deployed_at', type: 'timestamp' })
  deployedAt: Date;

  @Column({ name: 'deployment_url', type: 'text', nullable: true })
  deploymentUrl?: string;

  @Column({ name: 'deployment_config', type: 'jsonb', nullable: true })
  deploymentConfig?: Record<string, any>;

  @Column({ name: 'build_logs', type: 'text', nullable: true })
  buildLogs?: string;

  @Column({ name: 'deployment_logs', type: 'text', nullable: true })
  deploymentLogs?: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ name: 'rollback_reason', type: 'text', nullable: true })
  rollbackReason?: string;

  @Column({ name: 'rolled_back_at', type: 'timestamp', nullable: true })
  rolledBackAt?: Date;

  @Column({ name: 'rolled_back_by', type: 'string', nullable: true })
  rolledBackBy?: number;

  @Column({ name: 'health_check_url', type: 'text', nullable: true })
  healthCheckUrl?: string;

  @Column({ name: 'health_status', type: 'enum', enum: ['unknown', 'healthy', 'unhealthy', 'degraded'], default: 'unknown' })
  healthStatus: 'unknown' | 'healthy' | 'unhealthy' | 'degraded';

  @Column({ name: 'last_health_check', type: 'timestamp', nullable: true })
  lastHealthCheck?: Date;

  @Column({ name: 'performance_metrics', type: 'jsonb', nullable: true })
  performanceMetrics?: Record<string, any>;

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Relationships
  @ManyToOne('Artifact', 'deployments')
  @JoinColumn({ name: 'artifact_id' })
  artifact: any;
} 