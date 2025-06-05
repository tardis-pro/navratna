import { Entity, Column, Index, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { 
  AgentRole, 
  AgentPersona, 
  AgentIntelligenceConfig, 
  AgentSecurityContext 
} from '@uaip/types';

// Related entities will be referenced by string to avoid circular dependencies

/**
 * Enhanced Agent Entity with comprehensive intelligence and security features
 * Implements the enhanced agent model from the TypeORM migration plan
 */
@Entity('agents')
@Index(['role', 'isActive'])
@Index(['createdBy'])
@Index(['lastActiveAt'])
@Index(['securityLevel'])
export class Agent extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({ type: 'enum', enum: AgentRole })
  role: AgentRole;

  // Core persona and intelligence
  @Column({ type: 'jsonb' })
  persona: AgentPersona;

  @Column({ name: 'intelligence_config', type: 'jsonb' })
  intelligenceConfig: AgentIntelligenceConfig;

  @Column({ name: 'security_context', type: 'jsonb' })
  securityContext: AgentSecurityContext;

  // Status and activity
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'last_active_at', type: 'timestamp', nullable: true })
  lastActiveAt?: Date;

  // Enhanced capabilities tracking
  @Column({ type: 'jsonb', default: '[]' })
  capabilities: string[];

  @Column({ name: 'capability_scores', type: 'jsonb', nullable: true })
  capabilityScores?: Record<string, number>;

  @Column({ name: 'learning_history', type: 'jsonb', default: '[]' })
  learningHistory: any[];

  @Column({ name: 'performance_metrics', type: 'jsonb', nullable: true })
  performanceMetrics?: Record<string, any>;

  // Security and compliance
  @Column({ name: 'security_level', type: 'enum', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' })
  securityLevel: 'low' | 'medium' | 'high' | 'critical';

  @Column({ name: 'compliance_tags', type: 'jsonb', default: '[]' })
  complianceTags: string[];

  @Column({ name: 'audit_trail', type: 'jsonb', default: '[]' })
  auditTrail: any[];

  // Configuration and preferences
  @Column({ type: 'jsonb', nullable: true })
  configuration?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  preferences?: Record<string, any>;

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Version and deployment
  @Column({ length: 50, default: '1.0.0' })
  version: string;

  @Column({ name: 'deployment_environment', length: 50, nullable: true })
  deploymentEnvironment?: string;

  // Analytics and monitoring
  @Column({ name: 'total_operations', default: 0 })
  totalOperations: number;

  @Column({ name: 'successful_operations', default: 0 })
  successfulOperations: number;

  @Column({ name: 'average_response_time', type: 'decimal', precision: 10, scale: 2, nullable: true })
  averageResponseTime?: number;

  @Column({ name: 'last_performance_review', type: 'timestamp', nullable: true })
  lastPerformanceReview?: Date;

  // Tool System Integration - Enhanced from migration plan
  @Column({ name: 'tool_permissions', type: 'jsonb', nullable: true })
  toolPermissions?: Record<string, any>;

  @Column({ name: 'tool_preferences', type: 'jsonb', nullable: true })
  toolPreferences?: Record<string, any>;

  @Column({ name: 'tool_budget', type: 'jsonb', nullable: true })
  toolBudget?: Record<string, any>;

  @Column({ name: 'max_concurrent_tools', default: 3 })
  maxConcurrentTools: number;

  // Model Configuration - Enhanced from migration plan
  @Column({ name: 'model_id', nullable: true })
  modelId?: string;

  @Column({ name: 'api_type', type: 'enum', enum: ['ollama', 'llmstudio'], nullable: true })
  apiType?: 'ollama' | 'llmstudio';

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  temperature?: number;

  @Column({ name: 'max_tokens', nullable: true })
  maxTokens?: number;

  @Column({ name: 'system_prompt', type: 'text', nullable: true })
  systemPrompt?: string;

  // Relationships
  @OneToMany('Operation', 'agent')
  operations: any[];

  @OneToMany('ConversationContext', 'agent')
  conversations: any[];

  @OneToMany('AgentCapabilityMetric', 'agent')
  capabilityMetrics: any[];

  @OneToMany('ToolUsageRecord', 'agent')
  toolUsageRecords: any[];
} 