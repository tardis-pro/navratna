import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import type { Agent } from './agent.entity';

/**
 * Agent Learning Record Entity
 * Stores learning outcomes from agent operations (confidence adjustments, insights, etc.)
 */
@Entity('agent_learning_records')
@Index(['agentId', 'timestamp'])
@Index(['agentId', 'operationId'])
export class AgentLearningRecord extends BaseEntity {
  @Column({ name: 'agent_id' })
  agentId: string;

  @Column({ name: 'operation_id', type: 'uuid', nullable: true })
  operationId?: string;

  @Column({ name: 'learning_data', type: 'jsonb' })
  learningData: Record<string, unknown>;

  @Column({ name: 'confidence_adjustments', type: 'jsonb', nullable: true })
  confidenceAdjustments?: Record<string, unknown>;

  @Column({ length: 50, nullable: true })
  version?: string;

  @Column({ type: 'timestamp', default: () => 'NOW()' })
  timestamp: Date;

  // Relationships
  @ManyToOne('Agent', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent;
}
