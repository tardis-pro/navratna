import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Agent } from './agent.entity.js';
import { ToolDefinition } from './toolDefinition.entity.js';

@Entity('tool_assignments')
export class ToolAssignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Agent, agent => agent.toolAssignments)
  agent!: Agent;

  @ManyToOne(() => ToolDefinition, tool => tool.assignments)
  tool!: ToolDefinition;

  @Column({ default: true })
  canExecute!: boolean;

  @Column({ default: true })
  canRead!: boolean;

  @Column('jsonb', { nullable: true })
  customConfig?: any;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}