import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';

/**
 * Persona Analytics Entity
 * Tracks detailed analytics and performance metrics for personas
 */
@Entity('persona_analytics')
@Index(['personaId', 'recordedAt'])
@Index(['metricType', 'recordedAt'])
@Index(['period', 'personaId'])
export class PersonaAnalytics extends BaseEntity {
  @Column({ name: 'persona_id', type: 'bigint' })
  personaId: number;

  @Column({ name: 'metric_type', length: 100 })
  metricType: string;

  @Column({ name: 'recorded_at', type: 'timestamp' })
  recordedAt: Date;

  @Column({ length: 50 })
  period: string; // 'daily', 'weekly', 'monthly', 'quarterly'

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  value: number;

  @Column({ name: 'baseline_value', type: 'decimal', precision: 10, scale: 2, nullable: true })
  baselineValue?: number;

  @Column({ name: 'change_percentage', type: 'decimal', precision: 5, scale: 2, nullable: true })
  changePercentage?: number;

  @Column({ name: 'trend_direction', type: 'enum', enum: ['up', 'down', 'stable'], nullable: true })
  trendDirection?: 'up' | 'down' | 'stable';

  // Interaction metrics
  @Column({ name: 'total_interactions', default: 0 })
  totalInteractions: number;

  @Column({ name: 'successful_interactions', default: 0 })
  successfulInteractions: number;

  @Column({ name: 'average_response_time_ms', nullable: true })
  averageResponseTimeMs?: number;

  @Column({ name: 'user_satisfaction_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  userSatisfactionScore?: number;

  // Quality metrics
  @Column({ name: 'consistency_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  consistencyScore?: number;

  @Column({ name: 'coherence_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  coherenceScore?: number;

  @Column({ name: 'relevance_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  relevanceScore?: number;

  @Column({ name: 'creativity_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  creativityScore?: number;

  // Usage patterns
  @Column({ name: 'peak_usage_hour', nullable: true })
  peakUsageHour?: number;

  @Column({ name: 'most_common_topics', type: 'jsonb', default: '[]' })
  mostCommonTopics: string[];

  @Column({ name: 'conversation_length_avg', type: 'decimal', precision: 10, scale: 2, nullable: true })
  conversationLengthAvg?: number;

  @Column({ name: 'repeat_user_percentage', type: 'decimal', precision: 5, scale: 2, nullable: true })
  repeatUserPercentage?: number;

  // Performance indicators
  @Column({ name: 'error_rate', type: 'decimal', precision: 5, scale: 4, nullable: true })
  errorRate?: number;

  @Column({ name: 'timeout_rate', type: 'decimal', precision: 5, scale: 4, nullable: true })
  timeoutRate?: number;

  @Column({ name: 'escalation_rate', type: 'decimal', precision: 5, scale: 4, nullable: true })
  escalationRate?: number;

  @Column({ name: 'resolution_rate', type: 'decimal', precision: 5, scale: 2, nullable: true })
  resolutionRate?: number;

  // Detailed metrics
  @Column({ type: 'jsonb', nullable: true })
  details?: Record<string, any>;

  @Column({ name: 'comparison_data', type: 'jsonb', nullable: true })
  comparisonData?: Record<string, any>;

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Relationships
  @ManyToOne('Persona', 'analytics')
  @JoinColumn({ name: 'persona_id' })
  persona: any;
} 