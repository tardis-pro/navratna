import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';

/**
 * Tool Usage Record Entity
 * Tracks tool usage patterns and performance for agents
 */
@Entity('tool_usage_records')
@Index(['agentId', 'toolId'])
@Index(['usedAt', 'agentId'])
@Index(['toolId', 'success'])
export class ToolUsageRecord extends BaseEntity {
  @Column({ name: 'agent_id', type: 'bigint' })
  agentId: number;

  @Column({ name: 'tool_id', type: 'bigint' })
  toolId: number;

  @Column({ name: 'used_at', type: 'timestamp' })
  usedAt: Date;

  @Column({ name: 'execution_time_ms', nullable: true })
  executionTimeMs?: number;

  @Column({ default: true })
  success: boolean;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ type: 'jsonb', nullable: true })
  parameters?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  result?: any;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  cost?: number;

  @Column({ name: 'quality_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  qualityScore?: number;

  @Column({ name: 'user_satisfaction', type: 'decimal', precision: 3, scale: 2, nullable: true })
  userSatisfaction?: number;

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Relationships
  @ManyToOne('Agent', 'toolUsageRecords')
  @JoinColumn({ name: 'agent_id' })
  agent: any;

  @ManyToOne('ToolDefinition', 'usageRecords')
  @JoinColumn({ name: 'tool_id' })
  tool: any;
} 