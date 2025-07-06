import { Entity, Column, ManyToMany, JoinTable } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { Agent } from './agent.entity.js';

@Entity('capabilities')
export class Capability extends BaseEntity {
  @Column({ length: 255, unique: true })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 100 })
  category!: string;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  config?: Record<string, any>;

  @ManyToMany(() => Agent, agent => agent.capabilities)
  @JoinTable({
    name: 'agent_capabilities',
    joinColumn: { name: 'capability_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'agent_id', referencedColumnName: 'id' }
  })
  agents!: Agent[];
}

// For backward compatibility
export { Capability as AgentCapability };