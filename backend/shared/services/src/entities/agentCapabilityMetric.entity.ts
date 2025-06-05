import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';

/**
 * Agent Capability Metric Entity
 * Tracks performance metrics for specific agent capabilities
 */
@Entity('agent_capability_metrics')
@Index(['agentId', 'capability'])
@Index(['metricType', 'recordedAt'])
@Index(['capability', 'score'])
export class AgentCapabilityMetric extends BaseEntity {
  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @Column({ length: 100 })
  capability: string;

  @Column({ name: 'metric_type', length: 50 })
  metricType: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  score: number;

  @Column({ name: 'baseline_score', type: 'decimal', precision: 5, scale: 2, nullable: true })
  baselineScore?: number;

  @Column({ name: 'improvement_rate', type: 'decimal', precision: 5, scale: 2, nullable: true })
  improvementRate?: number;

  @Column({ name: 'recorded_at', type: 'timestamp' })
  recordedAt: Date;

  @Column({ name: 'measurement_period', length: 50, nullable: true })
  measurementPeriod?: string;

  @Column({ name: 'sample_size', nullable: true })
  sampleSize?: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  confidence?: number;

  @Column({ type: 'jsonb', nullable: true })
  details?: Record<string, any>;

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Relationships
  @ManyToOne('Agent', 'capabilityMetrics')
  @JoinColumn({ name: 'agent_id' })
  agent: any;
} 