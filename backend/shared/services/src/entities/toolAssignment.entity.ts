import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { Agent } from './agent.entity.js';
import { ToolDefinition } from './toolDefinition.entity.js';

@Entity('tool_assignments')
@Index(['agent', 'tool'], { unique: true }) // Prevent duplicate assignments
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

  // MCP-specific fields for selective tool attachment
  @Column({ nullable: true })
  mcpServerName?: string;

  @Column({ nullable: true })
  mcpToolName?: string;

  @Column({ default: false })
  isSelectiveAttachment!: boolean;

  @Column('jsonb', { nullable: true })
  attachmentMetadata?: {
    attachedAt: string;
    attachedBy: string;
    serverStatus: string;
    toolCapabilities: string[];
    originalServerToolCount: number;
    selectionReason?: string;
  };

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}