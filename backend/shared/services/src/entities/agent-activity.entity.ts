import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * Agent Activity Entity
 * Tracks individual agent activities (tool executions, responses, etc.)
 */
@Entity('agent_activities')
@Index(['agentId', 'timestamp'])
@Index(['agentId', 'type'])
export class AgentActivity extends BaseEntity {
  @Column({ name: 'agent_id' })
  agentId: string;

  @Column({ length: 100 })
  type: string;

  @Column({ type: 'int', default: 0 })
  duration: number;

  @Column({ default: true })
  success: boolean;

  @Column({ type: 'jsonb', nullable: true })
  context?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'timestamp', default: () => 'NOW()' })
  timestamp: Date;

  // Relationships
  @ManyToOne('Agent', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: any;
}
