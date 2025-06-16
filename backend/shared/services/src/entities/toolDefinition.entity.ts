import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { 
  ToolCategory, 
  JSONSchema, 
  ToolExample 
} from '@uaip/types';

// Define SecurityLevel enum for tools (different from general SecurityLevel)
export enum ToolSecurityLevel {
  SAFE = 'safe',
  MODERATE = 'moderate',
  RESTRICTED = 'restricted',
  DANGEROUS = 'dangerous'
}

// Related entities will be referenced by string to avoid circular dependencies

/**
 * Tool Definition Entity for the Tool System
 * Implements the comprehensive tool definition model from the TypeORM migration plan
 */
@Entity('tool_definitions')
@Index(['category', 'isEnabled'])
@Index(['securityLevel'])
@Index(['author'])
@Index(['version'])
export class ToolDefinition extends BaseEntity {
  @Column({ length: 255, unique: true })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: ToolCategory })
  category: ToolCategory;

  @Column({ type: 'jsonb' })
  parameters: JSONSchema;

  @Column({ name: 'return_type', type: 'jsonb' })
  returnType: JSONSchema;

  @Column({ type: 'jsonb', default: '[]' })
  examples: ToolExample[];

  @Column({ name: 'security_level', type: 'enum', enum: ToolSecurityLevel })
  securityLevel: ToolSecurityLevel;

  @Column({ name: 'cost_estimate', type: 'decimal', precision: 10, scale: 2, nullable: true })
  costEstimate?: number;

  @Column({ name: 'execution_time_estimate', nullable: true })
  executionTimeEstimate?: number;

  @Column({ name: 'requires_approval', default: false })
  requiresApproval: boolean;

  @Column({ type: 'jsonb', default: '[]' })
  dependencies: string[];

  @Column({ length: 50 })
  version: string;

  @Column({ length: 255 })
  author: string;

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ name: 'is_enabled', default: true })
  isEnabled: boolean;

  @Column({ name: 'rate_limits', type: 'jsonb', nullable: true })
  rateLimits?: Record<string, number>;

  // Usage and performance metrics
  @Column({ name: 'total_executions', default: 0 })
  totalExecutions: number;

  @Column({ name: 'successful_executions', default: 0 })
  successfulExecutions: number;

  @Column({ name: 'average_execution_time', type: 'decimal', precision: 10, scale: 2, nullable: true })
  averageExecutionTime?: number;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt?: Date;

  // Documentation and support
  @Column({ name: 'documentation_url', type: 'text', nullable: true })
  documentationUrl?: string;

  @Column({ name: 'support_contact', nullable: true })
  supportContact?: string;

  @Column({ name: 'changelog', type: 'jsonb', default: '[]' })
  changelog: any[];

  // Deployment and environment
  @Column({ name: 'deployment_config', type: 'jsonb', nullable: true })
  deploymentConfig?: Record<string, any>;

  @Column({ name: 'environment_requirements', type: 'jsonb', nullable: true })
  environmentRequirements?: Record<string, any>;

  // Quality and reliability metrics
  @Column({ name: 'reliability_score', type: 'decimal', precision: 3, scale: 2, nullable: true })
  reliabilityScore?: number;

  @Column({ name: 'user_rating', type: 'decimal', precision: 3, scale: 2, nullable: true })
  userRating?: number;

  @Column({ name: 'maintenance_status', type: 'enum', enum: ['active', 'maintenance', 'deprecated', 'archived'], default: 'active' })
  maintenanceStatus: 'active' | 'maintenance' | 'deprecated' | 'archived';

  // Relationships
  @OneToMany('ToolExecution', 'tool')
  executions: any[];

  @OneToMany('ToolUsageRecord', 'tool')
  usageRecords: any[];
} 